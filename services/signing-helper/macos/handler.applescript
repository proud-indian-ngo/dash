-- Proud Indian Signing.app: runs the helper for each pidash-sign:// link.

on helperPath()
	return POSIX path of (path to me) & "Contents/MacOS/pidash-sign"
end helperPath

on open location theURL
	do shell script quoted form of helperPath() & " " & quoted form of theURL & " > /dev/null 2>&1 &"
end open location

-- Helper 0.1.x installed a link-only app in ~/Applications that ran
-- ~/.local/bin/pidash-sign. Remove it so it can't take the links.
on removeOldInstall()
	set home to POSIX path of (path to home folder)
	set oldApp to home & "Applications/Proud Indian Signing.app"
	set lsregister to "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
	do shell script "if [ -d " & quoted form of oldApp & " ] && [ ! -e " & quoted form of (oldApp & "/Contents/MacOS/pidash-sign") & " ]; then " & lsregister & " -u " & quoted form of oldApp & "; rm -rf " & quoted form of oldApp & "; fi; rm -f " & quoted form of (home & ".local/bin/pidash-sign")
end removeOldInstall

on run
	try
		removeOldInstall()
	end try
	set helperVersion to do shell script quoted form of helperPath() & " --version"
	activate
	display dialog "The Proud Indian signing helper is ready (" & helperVersion & "). Plug in your DSC token and return to the dashboard." buttons {"OK"} default button "OK" with title "Proud Indian signing"
end run
