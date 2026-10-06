' Realm of AdAstra - yerel deneme oyun sunucusu bekcisini gorunmez pencerede baslatir (yonetici paneliyle, port 8080).
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = root
sh.Run "node """ & root & "\scripts\windows\online-keep-alive.cjs""", 0, False
