# Hook: Verifica que no se haga commit directo en main con cambios propios
$input_json = $input | Out-String | ConvertFrom-Json

$tool = $input_json.toolCall.name
$args_obj = $input_json.toolCall.args

# Solo actuar en run_command
if ($tool -ne "run_command") {
    @{ decision = "allow" } | ConvertTo-Json
    exit 0
}

$cmd = $args_obj.CommandLine

# Detectar git commit en main
if ($cmd -match "git commit") {
    $branch = (git -C $input_json.workspacePaths[0] rev-parse --abbrev-ref HEAD 2>$null).Trim()
    if ($branch -eq "main") {
        @{
            decision = "ask"
            reason   = "Estas a punto de hacer un commit directo en 'main'. Esta rama debe mantenerse sincronizada con openai/whisper. Tus cambios propios deben ir en 'mis-cambios'. Continuar de todas formas?"
        } | ConvertTo-Json
        exit 0
    }
}

@{ decision = "allow" } | ConvertTo-Json
