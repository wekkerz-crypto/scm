package main

import (
	"syscall"
	"unsafe"
)

// Fehlermeldung als Windows-Meldungsfenster (die .exe hat kein Konsolenfenster)
func messageBox(title, text string) {
	box := syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(text)
	box.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x10)
}
