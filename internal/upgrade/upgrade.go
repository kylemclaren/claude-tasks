package upgrade

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/kylemclaren/claude-tasks/internal/version"
)

const (
	repoOwner = "kylemclaren"
	repoName  = "claude-tasks"
)

// GitHubRelease represents a GitHub release
type GitHubRelease struct {
	TagName string  `json:"tag_name"`
	Name    string  `json:"name"`
	Assets  []Asset `json:"assets"`
	Body    string  `json:"body"`
}

// Asset represents a release asset
type Asset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

// CheckForUpdate checks if a newer version is available
func CheckForUpdate() (*GitHubRelease, bool, error) {
	release, err := getLatestRelease()
	if err != nil {
		return nil, false, err
	}

	currentVersion := version.Short()
	latestVersion := strings.TrimPrefix(release.TagName, "v")
	currentVersion = strings.TrimPrefix(currentVersion, "v")

	// Simple version comparison (works for semver)
	if latestVersion != currentVersion && currentVersion != "dev" {
		return release, true, nil
	}

	return release, false, nil
}

// Upgrade downloads and installs the latest version
func Upgrade() error {
	release, hasUpdate, err := CheckForUpdate()
	if err != nil {
		return fmt.Errorf("failed to check for updates: %w", err)
	}

	if !hasUpdate {
		fmt.Printf("Already running the latest version (%s)\n", version.Short())
		return nil
	}

	fmt.Printf("Upgrading from %s to %s...\n", version.Short(), release.TagName)

	// Find the appropriate asset for this OS/arch
	assetName := getAssetName()
	var downloadURL string
	for _, asset := range release.Assets {
		if asset.Name == assetName {
			downloadURL = asset.BrowserDownloadURL
			break
		}
	}

	if downloadURL == "" {
		return fmt.Errorf("no release found for %s/%s (looking for %s)", runtime.GOOS, runtime.GOARCH, assetName)
	}

	// Get current executable path
	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		return fmt.Errorf("failed to resolve executable path: %w", err)
	}

	// Download the new version
	fmt.Printf("Downloading %s...\n", assetName)
	tmpFile, err := downloadAsset(downloadURL)
	if err != nil {
		return fmt.Errorf("failed to download: %w", err)
	}
	defer os.Remove(tmpFile)

	// Extract if it's a tarball
	var newBinaryPath string
	if strings.HasSuffix(assetName, ".tar.gz") {
		newBinaryPath, err = extractTarGz(tmpFile)
		if err != nil {
			return fmt.Errorf("failed to extract: %w", err)
		}
		defer os.Remove(newBinaryPath)
	} else {
		newBinaryPath = tmpFile
	}

	// Replace the current executable
	fmt.Println("Installing...")
	if err := replaceExecutable(execPath, newBinaryPath); err != nil {
		return fmt.Errorf("failed to install: %w", err)
	}

	fmt.Printf("Successfully upgraded to %s!\n", release.TagName)
	return nil
}

func getLatestRelease() (*GitHubRelease, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", repoOwner, repoName)

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", version.UserAgent())

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, err
	}

	return &release, nil
}

func getAssetName() string {
	os := runtime.GOOS
	arch := runtime.GOARCH

	// Map arch names to match typical release naming
	if arch == "amd64" {
		arch = "x86_64"
	} else if arch == "386" {
		arch = "i386"
	}

	// Capitalize OS name
	if os == "darwin" {
		os = "Darwin"
	} else if os == "linux" {
		os = "Linux"
	} else if os == "windows" {
		os = "Windows"
		return fmt.Sprintf("claude-tasks_%s_%s.zip", os, arch)
	}

	return fmt.Sprintf("claude-tasks_%s_%s.tar.gz", os, arch)
}

func downloadAsset(url string) (string, error) {
	client := &http.Client{Timeout: 5 * time.Minute}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", version.UserAgent())

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download returned status %d", resp.StatusCode)
	}

	tmpFile, err := os.CreateTemp("", "claude-tasks-*")
	if err != nil {
		return "", err
	}
	defer tmpFile.Close()

	_, err = io.Copy(tmpFile, resp.Body)
	if err != nil {
		os.Remove(tmpFile.Name())
		return "", err
	}

	return tmpFile.Name(), nil
}

func extractTarGz(tarPath string) (string, error) {
	f, err := os.Open(tarPath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	gzr, err := gzip.NewReader(f)
	if err != nil {
		return "", err
	}
	defer gzr.Close()

	tr := tar.NewReader(gzr)

	// Look for the binary in the archive
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}

		// Look for the claude-tasks binary
		if header.Typeflag == tar.TypeReg &&
			(header.Name == "claude-tasks" || strings.HasSuffix(header.Name, "/claude-tasks")) {

			tmpFile, err := os.CreateTemp("", "claude-tasks-bin-*")
			if err != nil {
				return "", err
			}

			if _, err := io.Copy(tmpFile, tr); err != nil {
				tmpFile.Close()
				os.Remove(tmpFile.Name())
				return "", err
			}
			tmpFile.Close()

			// Make it executable
			if err := os.Chmod(tmpFile.Name(), 0755); err != nil {
				os.Remove(tmpFile.Name())
				return "", err
			}

			return tmpFile.Name(), nil
		}
	}

	return "", fmt.Errorf("binary not found in archive")
}

func replaceExecutable(oldPath, newPath string) error {
	// On Windows, we can't replace a running executable directly
	// On Unix, we can use rename

	// First, backup the old executable
	backupPath := oldPath + ".bak"
	if err := os.Rename(oldPath, backupPath); err != nil {
		return fmt.Errorf("failed to backup old executable: %w", err)
	}

	// Copy new executable to the target path
	newFile, err := os.Open(newPath)
	if err != nil {
		// Restore backup (best-effort)
		_ = os.Rename(backupPath, oldPath)
		return err
	}
	defer newFile.Close()

	destFile, err := os.OpenFile(oldPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		// Restore backup (best-effort)
		_ = os.Rename(backupPath, oldPath)
		return err
	}
	defer destFile.Close()

	if _, err := io.Copy(destFile, newFile); err != nil {
		destFile.Close()
		// Restore backup (best-effort)
		_ = os.Remove(oldPath)
		_ = os.Rename(backupPath, oldPath)
		return err
	}

	// Remove backup (best-effort cleanup)
	_ = os.Remove(backupPath)

	return nil
}
