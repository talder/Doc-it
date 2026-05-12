Add-PodeWebPage -Name "Authorization Groups" -DisplayName "Autorisatie groepen toekennen" -Icon "account-multiple-plus-outline" -Group "Primuz" -Layouts @(
    New-PodeWebCard -Content @(
        New-PodeWebForm -Name "Authorization group assign" -ShowReset -Content @(
            New-PodeWebSelect -Name "users" -DisplayName "Gebruiker" -Required -ScriptBlock{
                $OU = "OU=_Gebruikers,DC=sezz,DC=be"
                $users = Get-ADUser -Filter * -SearchBase $OU | Select-Object Name, SamAccountName, UserPrincipalName | Sort-Object Name
                Update-PodeWebSelect -Name "users" -DisplayOptions $users.Name -Options $users.SamAccountName
            }

            $options = Get-AuthGroups
            New-PodeWebCheckbox -Name "Authorization groups" -DisplayName "Autorisatie groepen" -AsSwitch -Options $options

        ) -ScriptBlock {
            
            $AuthGroup = $WebEvent.Data['Authorization groups'] -replace 'AUTH_',''

            $payload = @{
                data = @{
                    User =  $WebEvent.Data['users']
                    AuthorizationGroup = $AuthGroup
                } 
            }

            # Define the Jenkins webhook URL
            $webhookUrl = "https://jenkins.sezz.be/generic-webhook-trigger/invoke?token=ADD_USER_TO_AUTHORIZATION_GROUP"
            
            # Convert the payload to JSON
            $jsonPayload = $payload | ConvertTo-Json
            Out-PodeHost $jsonPayload
            # Send the data using Invoke-RestMethod
            $response = Invoke-RestMethod -Uri $webhookUrl -Method Post -Body $jsonPayload -ContentType "application/json"
            
            Out-PodeHost $response
            Show-PodeWebToast -Message "Jenkins job aangeroepen om gebruiker toe te voegen aan een autorisatie groep." -Duration 5000
            Reset-PodeWebForm -Name "Authorization group assign"
        } -SubmitText "Voeg groep(en) toe"
    )
)