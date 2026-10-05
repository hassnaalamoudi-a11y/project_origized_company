$c = [System.IO.File]::ReadAllText('index.html')
$start = $c.IndexOf('<script>')
$end = $c.LastIndexOf('</script>')
$script = $c.Substring($start + 8, $end - $start - 8).Trim()
[System.IO.File]::WriteAllText('scratch_script_2.js', $script, [System.Text.Encoding]::UTF8)
Write-Output "Extraction complete"
