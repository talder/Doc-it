Add-PodeWebPage -Name "SQL Database List" -DisplayName "Lijst met alle databases op SQL server" -Icon "account-multiple-plus-outline" -Group "SQL Server" -Layouts @(
    New-PodeWebCard -Content @(
            New-PodeWebText -Value "Het ophalen van alle DB info kan zeker 30 sec. in beslag nemen." -Style Bold
            New-PodeWebTable -Name "SQL Databases" -ScriptBlock {
                Get-DbaAgDatabase -SqlInstance vgsqlp01 -SqlCredential (Import-Clixml "c:\CREDS\mssql_cred.xml") | select-object SqlInstance, AvailabilityGroup, LocalReplicaRole, Name, SynchronizationState, IsFailoverReady
            } -SimpleFilter -SimpleSort -Compact
        )
)