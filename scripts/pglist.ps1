Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" | ForEach-Object {
  $cmd = $_.CommandLine
  if ($cmd.Length -gt 200) { $cmd = $cmd.Substring(0, 200) }
  [PSCustomObject]@{ Pid = $_.ProcessId; Cmd = $cmd }
} | Format-Table -AutoSize | Out-String -Width 220
