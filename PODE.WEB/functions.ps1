
function Get-AutohorizationGroups {
    [CmdletBinding()]
    param
    (
        [Parameter(Mandatory = $true)]
        [string]$UserToSearch
    )

    # initialize the array
    $authGroups = @()

    # Get the user's groups
    $userGroups = Get-ADUser -Identity $UserToSearch -Properties MemberOf | Select-Object -ExpandProperty MemberOf

    # Filter groups that start with 'AUTH_' and add them to the array
    foreach ($groupDN in $userGroups) {
        $group = Get-ADGroup -Identity $groupDN
        if ($group.Name -like "AUTH_*") {
            $authGroups += $group.Name
        }
    }
    Out-PodeHost $authGroups
    return $authGroups
}

#Function to clear the values of podewebselect
function clear-forcepodewebselect {
    [CmdletBinding()]
    param 
    (
        [Parameter(Mandatory = $true)]
        [string]$PodeWebSelectToClear
    )
    
    Clear-PodeWebSelect -Name $PodeWebSelectToClear
}

#Function to retreive AUTHORIZATION groups from AD
function Get-AuthGroups {
    $Domain = "sezz.be"
    $OU = "OU=AUTHORISATION_GROUPS,OU=_Groepen,DC=sezz,DC=be"
    
    # Initialize the array to store group names
    $options = @()

    try {
        # Get all groups with the prefix AUTH_ in the specified OU
        $authGroups = Get-ADGroup -Filter { Name -like "AUTH_*" } -SearchBase $OU -Server $Domain | Sort-Object 

        # Add each group name to the $options array
        foreach ($group in $authGroups) {
            $options += $group.Name
        }

        Write-Output "Retrieved AUTH_ groups successfully."
    } catch {
        Write-Output "ERROR: Could not retrieve AUTH_ groups. $_"
    }

    # Return the array of group names
    return $options
}

function Get-PrimuzShadowSessions {
    Invoke-WebRequest -Uri "http://httpsrv/j2ee/j2ee_keyuser.config" -OutFile "C:\SCRIPTS\TMP\j2ee_keyuser.config"
    $FileFirstLine = Get-Content -Path C:\SCRIPTS\TMP\j2ee_keyuser.config -TotalCount 1

    $ProductionPortNumber = $FileFirstLine.Split(":")

    write-host "Production port number: " $ProductionPortNumber[2]

    switch ($ProductionPortNumber[2]) {
        7011 {
            $ShadowPortNumber = 7012
            $WeblogicServer = "zkj2eesezz01"
        }
        
        7012 {
            $ShadowPortNumber = 7011
            $WeblogicServer = "zgj2eesezz01"
        }
        
        7021 {
            $ShadowPortNumber = 7022
            $WeblogicServer = "zkj2eesezz01"
        }
        
        7022 {
            $ShadowPortNumber = 7021
            $WeblogicServer = "zgj2eesezz01"
        }

        7031 {
            $ShadowPortNumber = 7032
            $WeblogicServer = "zkj2eesezz01"
        }
        
        7032 {
            $ShadowPortNumber = 7031
            $WeblogicServer = "zgj2eesezz01"
        }
        
        Default {exit}
    }

    write-host "Shadow server: " $WeblogicServer
    write-host "Shadow port: " $ShadowPortNumber

    $username = "root"
    $password = ConvertTo-SecureString "Primuz9620" -AsPlainText -Force
    $psCred = New-Object System.Management.Automation.PSCredential -ArgumentList ($username, $password)

    New-SSHSession -ComputerName $WeblogicServer -Credential $psCred -AcceptKey | Out-Null

    $result = Invoke-SSHCommand -SessionId 0 -Command "netstat -a | grep $ShadowPortNumber | sed -e 's/\.\([^.]*\) / \1/g' -e 's/  */ /g' | nawk 'BEGIN {format=`"%-0s\|%-0s\|%-0s\|%-0s\n`";printf(format,`"local_host`",`"local_protocol`",`"remote_host`",`"remote_protocol`")} {printf(format,`$1,`$2,`$3,`$4)}'"

    $data =@()

    foreach ($line in $result.output) {
        $splitter = $line.Split("|")
        
        if ($splitter[0] -like "*local_host*") {
            continue
        }

        $row = "" | Select-Object server, localport, remotehost, remoteport
        $row.server = $splitter[0]
        $row.localport = $splitter[1]
        $row.remotehost = $splitter[2]
        $row.remoteport = $splitter[3]
        
        $data += $row
    }

    return $data
}

function Get-PrimuzKeyuserSessions {
    Invoke-WebRequest -Uri "http://httpsrv/j2ee/j2ee_keyuser.config" -OutFile "C:\SCRIPTS\TMP\j2ee_keyuser.config"
    $FileFirstLine = Get-Content -Path C:\SCRIPTS\TMP\j2ee_keyuser.config -TotalCount 1

    $PortNumber = $FileFirstLine.Split(":")

    $username = "root"
    $password = ConvertTo-SecureString "Primuz9620" -AsPlainText -Force
    $psCred = New-Object System.Management.Automation.PSCredential -ArgumentList ($username, $password)

    New-SSHSession -ComputerName zgj2eesezz01 -Credential $psCred -AcceptKey | Out-Null

    $result = Invoke-SSHCommand -TimeOut 120 -SessionId 0 -Command "netstat -a | grep $($PortNumber[2]) | sed -e 's/\.\([^.]*\) / \1/g' -e 's/  */ /g' | nawk 'BEGIN {format=`"%-0s\|%-0s\|%-0s\|%-0s\n`";printf(format,`"local_host`",`"local_protocol`",`"remote_host`",`"remote_protocol`")} {printf(format,`$1,`$2,`$3,`$4)}'"

    $keyusersessions =@()

    foreach ($line in $result.output) {
        $splitter = $line.Split("|")
        
        if ($splitter[0] -like "*local_host*") {
            continue
        }

        $row = "" | Select-Object server, localport, remotehost, remoteport
        $row.server = $splitter[0]
        $row.localport = $splitter[1]
        $row.remotehost = $splitter[2]
        $row.remoteport = $splitter[3]
        
        $keyusersessions += $row
    }

    return $keyusersessions
}

function Get-DeviceType {
    [CmdletBinding()]
    param
    (
        [Parameter(Mandatory = $true)]
        [string]$Manufacturer
    )

    $password = "7bb6da9f95406bd62c4fdcdf8d722c815432b51f" | ConvertTo-SecureString -AsPlainText -Force
    $username = "sez\psuniversalsvc"
    $credential = New-Object System.Management.Automation.PSCredential($username, $password)
    Connect-NetboxAPI -Hostname netbox.sezz.be -Credential $credential -Scheme https -port 443

    try {
        $output = Get-NetboxDCIMDeviceType -Manufacturer $Manufacturer -ErrorAction Stop | Select-Object -Property model, id

        if ($output -eq $null -or $output.Count -eq 0) {
            Out-PodeHost "No DeviceType found for $Manufacturer"
            return "error"
        } else {
            Out-PodeHost $output
            return $output
        }
    } catch {
        Out-PodeHost "An error occurred: $Error"
        return "error"
    }
}
