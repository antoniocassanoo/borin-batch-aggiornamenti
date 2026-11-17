' BORIN Batch: apre Photoshop con il pannello BORIN Batch (doppio clic sul collegamento "BORIN Batch").
' Scrive il segnale "apri-pannello" nella cartella dei dati e apre Photoshop: l'estensione invisibile
' "com.borin.batch.avvio", che parte con Photoshop, vede il segnale e apre il pannello.
Option Explicit
Dim sh, fso, dati, f, ps, cartella, sotto, nome, migliore
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dati = sh.ExpandEnvironmentStrings("%APPDATA%") & "\BORIN"
If Not fso.FolderExists(dati) Then fso.CreateFolder dati
dati = dati & "\Batch Photoshop"
If Not fso.FolderExists(dati) Then fso.CreateFolder dati
Set f = fso.CreateTextFile(dati & "\apri-pannello", True)
f.Write CStr(Now)
f.Close

' Photoshop registrato in Windows (App Paths); altrimenti la cartella "Adobe Photoshop 20xx" piu' recente.
ps = ""
On Error Resume Next
ps = sh.RegRead("HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Photoshop.exe\")
On Error GoTo 0
If ps = "" Or Not fso.FileExists(ps) Then
  ps = ""
  cartella = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Adobe"
  If fso.FolderExists(cartella) Then
    migliore = ""
    For Each sotto In fso.GetFolder(cartella).SubFolders
      nome = sotto.Name
      If LCase(Left(nome, 18)) = "adobe photoshop 20" And fso.FileExists(sotto.Path & "\Photoshop.exe") Then
        If nome > migliore Then migliore = nome: ps = sotto.Path & "\Photoshop.exe"
      End If
    Next
  End If
End If
If ps = "" Then
  fso.DeleteFile dati & "\apri-pannello", True
  MsgBox "Photoshop non trovato." & vbCrLf & "BORIN Batch si apre dentro Photoshop 2022 o successivo: installalo da Adobe Creative Cloud.", vbExclamation, "BORIN Batch"
  WScript.Quit 1
End If
' Se Photoshop e' gia' aperto, Windows lo porta in primo piano invece di aprirne un altro.
sh.Run """" & ps & """", 1, False
