Add-PodeWebPage -Name "Authorization Groups removal" -DisplayName "Autorisatie groepen verwijderen" -Icon "account-multiple-remove-outline" -Group "Primuz" -Layouts @(
    New-PodeWebCard -Content @(
        New-PodeWebForm -Name "Authorization group remove" -ShowReset -Content @(
            New-PodeWebSelect -Name "users_to_remove" -DisplayName "Gebruiker" -Required -ScriptBlock {
                $OU = "OU=_Gebruikers,DC=sezz,DC=be"
                $users = Get-ADUser -Filter * -SearchBase $OU | Select-Object Name, SamAccountName, UserPrincipalName | Sort-Object Name
                Update-PodeWebSelect -Name "users_to_remove" -DisplayOptions $users.Name -Options $users.SamAccountName
            } | Register-PodeWebEvent -Type Change -ScriptBlock {
                $username = $WebEvent.data['users_to_remove']
                $ResultsAuthGroups = Get-AutohorizationGroups -UserToSearch $username
                
                if ($ResultsAuthGroups -eq $null -or $ResultsAuthGroups -eq 0) {
                    Clear-PodeWebSelect -Name "Authorization groups to remove"
                } else {
                    Update-PodeWebSelect -Name "Authorization groups to remove" -Options $ResultsAuthGroups
                }
        
            } 

            New-PodeWebSelect -Name "Authorization groups to remove"-DisplayName "Autorisatie groepen" -Multiple -Size 15 -Required             

        ) -ScriptBlock {
            
            $AuthGroup = $WebEvent.Data['Authorization groups to remove'] -replace 'AUTH_',''

            $payload = @{
                data = @{
                    User               = $WebEvent.Data['users_to_remove']
                    AuthorizationGroup = $AuthGroup
                } 
            }

            # Define the Jenkins webhook URL
            $webhookUrl = "https://jenkins.sezz.be/generic-webhook-trigger/invoke?token=REMOVE_USER_FROM_AUTHORIZATION_GROUP"
            
            # Convert the payload to JSON
            $jsonPayload = $payload | ConvertTo-Json
            Out-PodeHost $jsonPayload
            # Send the data using Invoke-RestMethod
            $response = Invoke-RestMethod -Uri $webhookUrl -Method Post -Body $jsonPayload -ContentType "application/json"
            
            Show-PodeWebToast -Message "Jenkins job aangeroepen om gebruiker te verwijderen uit een autorisatie groep." -Duration 5000
            Reset-PodeWebForm -Name "Authorization Groups removal"
            Clear-PodeWebSelect -name "Authorization groups to remove"
        } -SubmitText "Verwijder groep(en)"

    )
)

