' Smart Dairy — Desktop Shortcut Creator
' Creates a shortcut on the user's Desktop pointing to start.bat

Set WshShell = WScript.CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get paths
strDesktop = WshShell.SpecialFolders("Desktop")
strProjectDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
strTarget = fso.BuildPath(strProjectDir, "start.bat")
strShortcut = fso.BuildPath(strDesktop, "Smart Dairy.lnk")

' Create shortcut
Set oLink = WshShell.CreateShortcut(strShortcut)
oLink.TargetPath = strTarget
oLink.WorkingDirectory = strProjectDir
oLink.Description = "Start Smart Dairy — Milk Collection & Dairy Management"
oLink.WindowStyle = 1  ' Normal window
oLink.Save

WScript.Echo "  Shortcut created: " & strShortcut
