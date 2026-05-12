Add-PodeWebPage -Name "Add doctor folder" -DisplayName "Voeg permissie toe aan een dokter folder" -Icon "stethoscope" -Group "Gebruikersbeheer" -Layouts @(
    New-PodeWebCard -Content @(
        New-PodeWebForm -Name "Add folder to doctor" -ShowReset -Content @(
            New-PodeWebSelect -Name "doctor_to_add" -DisplayName "Dokter" -Required -ScriptBlock {
                $OU = "OU=Dokters,OU=_Gebruikers,DC=sezz,DC=be"
                $users = Get-ADUser -Filter * -SearchBase $OU | Select-Object Name, SamAccountName, UserPrincipalName | Sort-Object Name
                Update-PodeWebSelect -Name "doctor_to_add" -DisplayOptions $users.Name -Options $users.SamAccountName
            } 

            New-PodeWebTextbox -name "doctor_number" -DisplayName "Dokter nummer" -MaxLength 6 -HelpText "Geef het dokters nummer in van 6 karakters" -Required -Type number -size 6
                   
        ) -ScriptBlock {

            # Retrieve form data
            $doctorNumber = $WebEvent.Data['doctor_number']

            # Validation: Check if doctor_number is 6 characters long
            if ($doctorNumber.Length -ne 6) {
                Show-PodeWebToast -Message "Het doktersnummer moet exact 6 karakters lang zijn." -Duration 5000 -Type Error
                return
            }


            $payload = @{
                data = @{
                    doc               = $WebEvent.Data['doctor_to_add']
                    docnum            = $doctorNumber
                } 
            }

            # Define the Jenkins webhook URL
            $webhookUrl = "https://jenkins.sezz.be/generic-webhook-trigger/invoke?token=ADD_DOCTOR_FOLDER"
            
            # Convert the payload to JSON
            $jsonPayload = $payload | ConvertTo-Json
            Out-PodeHost $jsonPayload
            # Send the data using Invoke-RestMethod
            $response = Invoke-RestMethod -Uri $webhookUrl -Method Post -Body $jsonPayload -ContentType "application/json"
            
            Show-PodeWebToast -Message "Jenkins job aangeroepen om dokter toe te voegen aan zijn facturatie groepen." -Duration 5000
            Reset-PodeWebForm -Name "Add doctor folder"
            Clear-PodeWebSelect -name "doctor_to_add"
        } -SubmitText "Dokter toevoegen"

    )
)

