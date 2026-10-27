//go:build !windows

package main

import "os"

func messageBox(title, text string) { os.Stderr.WriteString(title + ": " + text + "\n") }
