# Import the necessary modules
Import-Module Pode.Web
Import-Module NetboxPS
import-module SEZZPS
import-module Posh-SSH
Import-Module ActiveDirectory

#import functions only for icttools.ps1
import-module "$PSScriptRoot\functions.ps1"

$DebugPreference = "Continue"

Start-PodeServer -RootPath $PSScriptRoot {
    @{
        Web = @{
            Static = @{
                Cache = @{
                    Enable = $true
                }
            }
        }
    }

    @{
        Server = @{
            Request = @{
                Timeout = 3600  # Timeout value in seconds
            }
        }
    }
    # add a simple endpoint
    Add-PodeEndpoint -Address 0.0.0.0 -Port 8090 -Protocol Http
    
    # enable security
    Enable-PodeSessionMiddleware -Duration 120 -Extend
    
    # Define the authentication scheme and add authentication
    New-PodeAuthScheme -Form | Add-PodeAuthWindowsAd -Name SEZZ_AUTH -Groups @('APP_IT_Tools')
    
    # Configure logging
    New-PodeLoggingMethod -Terminal | Enable-PodeErrorLogging

    # set the use of templates, and set a login page
    Use-PodeWebTemplates -Title 'IT Tools' -Theme Auto -FavIcon "toolbox-outline" -Security Simple

    # Set the login page with the specified authentication
    Set-PodeWebLoginPage -Authentication SEZZ_AUTH




    Add-PodeWebPage -Name "Printer aanmaken" -Icon "printer" -Group "IPAM" -Layouts @(
        New-PodeWebCard -Content @(
            New-PodeWebForm -Name "Printer toevoegen" -Content @(
                New-PodeWebTextbox -Name "txt_printername" -DisplayName "Naam" -MaxLength 15 -Required -AutoFocus -HelpText "Printernaam opgeven in hoofdletters."
                New-PodeWebTextbox -Name "txt_macaddress" -DisplayName "MAC" -MaxLength 17 -Required -HelpText "MAC adres in de vorm AA:BB:CC:DD:EE:FF"
                New-PodeWebSelect -DisplayName "Merk" -Name "Manufacturer" -Options @("altec","hp", "kyocera", "brother", "canon", "zebra", "pdc") -DisplayOptions @("Altec", "HP", "Kyocera", "Brother", "Canon", "Zebra", "PDC") | Register-PodeWebEvent -Type Change -ScriptBlock {
                    $manufacturer = $WebEvent.Data['Manufacturer']
                    $items = Get-DeviceType $manufacturer
                    if ($items -eq "error") {
                        Clear-PodeWebSelect -Name "Type"
                        Show-PodeWebToast -Message "No device types for $manufacturer defined in Netbox" -Duration 5000
                    }
                    else {
                        Update-PodeWebSelect -Name "Type" -Options $items.id -DisplayOptions $items.model
                    }
                }
                New-PodeWebSelect -Name "Type" -Required -ScriptBlock {
                    $manufacturer = 'altec'
                    $items = Get-DeviceType $manufacturer
                    if ($items -eq "error") {
                        Clear-PodeWebSelect -Name "Type"
                        Show-PodeWebToast -Message "No device types for $manufacturer defined in Netbox" -Duration 5000
                    }
                    else {
                        Update-PodeWebSelect -Name "Type" -Options $items.id -DisplayOptions $items.model
                    }
                }
                New-PodeWebTextbox -Name "txt_assettag" -DisplayName "Asset tag" -Type Text -Required
                New-PodeWebTextbox -Name "txt_comment" -DisplayName "Commentaar" -Type Text
            ) -ShowReset -ScriptBlock {
                $invalid = $false

                $regex = '^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$'
                if ($WebEvent.data.txt_macaddress -notmatch $regex) {
                    Out-PodeWebValidation -Name 'txt_macaddress' -Message 'MAC adres is in een foutief formaat.'
                    $invalid = $true
                }

                if ($WebEvent.data.Type -eq $null) {
                    Out-PodeWebValidation -Name 'Type' -Message 'Selecteer een printer type.'
                    $invalid = $true
                }

                if ($invalid) {
                    return
                }
            
                $payload = @{
                    data = @{
                        PrinterName         = $WebEvent.Data['txt_printername'].ToUpper()
                        MACAddress          = $WebEvent.Data['txt_macaddress'].ToUpper()
                        PrinterManufacturer = $WebEvent.Data['Manufacturer']
                        DeviceTypeID        = $WebEvent.Data['Type']
                        Comment             = $WebEvent.Data['txt_comment']
                        AssetTag            = $WebEvent.Data['txt_assettag']
                    } 
                }
                
                # Define the Jenkins webhook URL
                $webhookUrl = "https://jenkins.sezz.be/generic-webhook-trigger/invoke?token=ADD_PRINTER"
                
                # Convert the payload to JSON
                $jsonPayload = $payload | ConvertTo-Json
                Out-PodeHost $jsonPayload
                # Send the data using Invoke-RestMethod
                $response = Invoke-RestMethod -Uri $webhookUrl -Method Post -Body $jsonPayload -ContentType "application/json"

                Show-PodeWebToast "Printer aangemaakt, zie mail met info voor IP." -Duration 10000
                Reset-PodeWebForm -Name "Printer toevoegen"
            }
        )
    )

    Add-PodeWebPage -Name "Computer aanmaken" -Icon "desktop-classic" -Group "IPAM" -Layouts @(
        New-PodeWebCard -Content @(

            New-PodeWebText -Value "In ontwikkeling, komt er aan!"
        )
    )
    
    #User management
    Add-PodeWebPage -Name "AD Gebruikers" -Icon "account-group" -Group "Gebruikersbeheer" -Layouts @(
        New-PodeWebCard -Content @(

            New-PodeWebTable -Name "AD Gebruikers" -ScriptBlock {
                
                    Get-ADUser -Filter * -Properties Enabled | Select-Object SAMAccountName, GivenName, Surname, UserPrincipalName,
                         @{Name='Status';Expression={ if ($_.Enabled) { 'Enabled' } else { 'Disabled' } }} |
                         Sort-Object SAMAccountName
                
                
                #Get-ADUser -filter * | Select-Object SAMAccountName, Givenname, surname, UserPrincipalName, Status | sort-object SAMAccountName
            } -SimpleFilter -SimpleSort -Compact
        )
    )
    #Resterende actieve sessies on de shadow zijde van Primuz
    Add-PodeWebPage -Name "Actieve shadow sessies" -Icon "box-shadow" -Group "Primuz" -Layouts @(
        New-PodeWebCard -Content @(
            New-PodeWebTable -Name "Shadow sessions" -ScriptBlock {
                Get-PrimuzShadowSessions
            } -SimpleFilter -SimpleSort -Compact
        )
    )

    #resterende keyuser sessions 
    Add-PodeWebPage -Name "Actieve keyuser sessies" -Icon "account-key-outline" -Group "Primuz" -Layouts @(
        New-PodeWebCard -Content @(
            New-PodeWebTable -Name "Keyuser sessions" -ScriptBlock {
                Get-PrimuzKeyuserSessions
            } -SimpleFilter -SimpleSort -Compact
        )
    )

    #PodeWebPages to include
    . "$PSScriptRoot\webpages\add_authorization_groups.ps1"

    . "$PSScriptRoot\webpages\remove_authorization_groups.ps1"


    #Set the homepage items
    Set-PodeWebHomePage -Layouts @(
        New-PodeWebCard -Content @(

            New-PodeWebText -Value "Welkom op de IT tool pagina."
        )
    )
}


