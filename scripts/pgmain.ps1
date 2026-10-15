$all = Get-CimInstance Win32_Process -Filter "Name='postgres.exe'"
foreach ($p in $all) {
  $cmd = $p.CommandLine
  if ($cmd -match ' -D ') {
    $m = [regex]::Match($cmd, '-D\s+(\S+)')
    $dir = if ($m.Success) { $m.Groups[1].Value } else { '(unparsed)' }
    Write-Output ($p.ProcessId.ToString() + ' :: ' + $dir)
  }
}
Write-Output '--- done ---'
