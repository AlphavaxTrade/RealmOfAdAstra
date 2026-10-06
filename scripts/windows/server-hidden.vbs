' Realm of AdAstra - sunucu bekcisini gorunmez pencerede baslatir.
' Pencere olmadigi icin PowerShell/cmd kapatilinca sunucu kapanmaz.
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = root
sh.Run "node """ & root & "\scripts\windows\keep-alive.cjs""", 0, False
