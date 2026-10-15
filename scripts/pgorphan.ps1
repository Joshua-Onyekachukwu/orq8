$all = Get-CimInstance Win32_Process -Filter "Name='postgres.exe'"
$live = @{}
foreach ($p in $all) { $live[$p.ProcessId] = $true }
foreach ($p in $all) {
  $ppid = $p.ParentProcessId
  $parentAlive = $live.ContainsKey($ppid)
  $cmd = $p.CommandLine
  if ($cmd.Length -gt 120) { $cmd = $cmd.Substring(0, 120) }
  $flag = if ($parentAlive) { 'parent-live' } else { 'ORPHAN' }
  Write-Output ($p.ProcessId.ToString() + ' ppid=' + $ppid + ' ' + $flag + ' :: ' + $cmd)
}
Write-Output '--- done ---'
