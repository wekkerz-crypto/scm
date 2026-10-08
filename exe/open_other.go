//go:build !windows

package main

import (
	"os/exec"
	"runtime"
)

func openFile(path string) error {
	if runtime.GOOS == "darwin" {
		return exec.Command("open", path).Start()
	}
	return exec.Command("xdg-open", path).Start()
}
