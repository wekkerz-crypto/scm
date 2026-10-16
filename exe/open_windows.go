package main

import (
	"syscall"
	"unsafe"
)

// Öffnet die Seite mit dem Standardprogramm für .html (wie ein Doppelklick im Explorer)
func openFile(path string) error {
	verb, _ := syscall.UTF16PtrFromString("open")
	file, _ := syscall.UTF16PtrFromString(path)
	r, _, err := syscall.NewLazyDLL("shell32.dll").NewProc("ShellExecuteW").Call(0,
		uintptr(unsafe.Pointer(verb)), uintptr(unsafe.Pointer(file)), 0, 0, 1)
	if r <= 32 {
		return err
	}
	return nil
}
