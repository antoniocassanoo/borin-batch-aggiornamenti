# BORIN Batch  crea il collegamento "BORIN Batch" sul desktop e nel menu Start (Windows).
# Un doppio clic apre Photoshop con il pannello BORIN Batch: il collegamento lancia avvia.vbs, qui accanto.
# Lo usano l'installatore e il pannello (Info  "Aprire BORIN Batch come un'app"). Stampa i collegamenti creati.
$ErrorActionPreference = "Stop"
$qui = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $qui "avvia.vbs"
$ico = Join-Path $qui "BORIN Batch.ico"
if (-not (Test-Path $vbs)) { throw "Manca $vbs" }
$sh = New-Object -ComObject WScript.Shell
foreach ($cartella in @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("Programs"))) {
  if (-not $cartella) { continue }
  $percorso = Join-Path $cartella "BORIN Batch.lnk"
  $lnk = $sh.CreateShortcut($percorso)
  $lnk.TargetPath = Join-Path $env:SystemRoot "System32\wscript.exe"
  $lnk.Arguments = '"' + $vbs + '"'
  $lnk.WorkingDirectory = $qui
  $lnk.IconLocation = "$ico,0"
  $lnk.Description = "Apre Photoshop con il pannello BORIN Batch"
  $lnk.Save()
  Write-Output $percorso
}
