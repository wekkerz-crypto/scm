// STEP2XCS.exe – startet das Web-Tool (STEP → XCS für SCM Maestro) im Standardbrowser.
//
// Die Seite ist eingebettet. Beim Start wird sie nach %LOCALAPPDATA%\STEP2XCS\app entpackt (nur wenn sich
// der Inhalt geändert hat) und als Datei geöffnet. Fester Ort = Einstellungen und Favoriten bleiben im Browser
// erhalten. Kein Server, kein Internet nötig.
package main

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"io/fs"
	"os"
	"path/filepath"
)

//go:embed all:web
var webFiles embed.FS

func main() {
	dir, err := appDir()
	if err != nil {
		fail("Kein Ordner zum Entpacken gefunden:\n" + err.Error())
	}
	if err := extract(dir); err != nil {
		fail("Entpacken nach\n" + dir + "\nfehlgeschlagen:\n" + err.Error())
	}
	if err := openFile(filepath.Join(dir, "index.html")); err != nil {
		fail("Browser konnte nicht geöffnet werden:\n" + err.Error())
	}
}

func appDir() (string, error) {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		var err error
		if base, err = os.UserCacheDir(); err != nil {
			return "", err
		}
	}
	return filepath.Join(base, "STEP2XCS", "app"), nil
}

// Prüfsumme über alle eingebetteten Dateien: nur neu schreiben, wenn sich etwas geändert hat
func checksum() string {
	h := sha256.New()
	fs.WalkDir(webFiles, "web", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		b, _ := webFiles.ReadFile(p)
		h.Write([]byte(p))
		h.Write(b)
		return nil
	})
	return hex.EncodeToString(h.Sum(nil))
}

func extract(dir string) error {
	sum := checksum()
	stamp := filepath.Join(dir, ".version")
	if old, err := os.ReadFile(stamp); err == nil && string(old) == sum {
		if _, err := os.Stat(filepath.Join(dir, "index.html")); err == nil {
			return nil
		}
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	err := fs.WalkDir(webFiles, "web", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel("web", filepath.FromSlash(p))
		target := filepath.Join(dir, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		b, err := webFiles.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(target, b, 0o644)
	})
	if err != nil {
		return err
	}
	return os.WriteFile(stamp, []byte(sum), 0o644)
}

func fail(msg string) {
	messageBox("STEP2XCS", msg)
	os.Exit(1)
}
