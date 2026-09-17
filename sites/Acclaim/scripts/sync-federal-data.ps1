[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$siteRoot = Split-Path -Parent $PSScriptRoot
$dataRoot = Join-Path $siteRoot 'public\data'
$retrievedOn = (Get-Date).ToString('yyyy-MM-dd')

$senateUrl = 'https://www.senate.gov/general/contact_information/senators_cfm.xml'
$houseUrl = 'https://clerk.house.gov/xml/lists/MemberData.xml'
$districtUrl = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/4/query?where=1%3D1&outFields=STATE%2CCD119%2CGEOID%2CNAME%2CBASENAME&returnGeometry=true&outSR=4326&geometryPrecision=4&maxAllowableOffset=0.003&f=geojson'

$mappedStates = @(
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO',
  'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
)

$mappedFips = @(
  '01', '02', '04', '05', '06', '08', '09', '10', '11', '12', '13', '15', '16',
  '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29',
  '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42',
  '44', '45', '46', '47', '48', '49', '50', '51', '53', '54', '55', '56'
)

function Get-RemoteText([string]$Url) {
  $lines = & curl.exe -L --fail --silent --show-error $Url
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to retrieve $Url"
  }
  return $lines -join "`n"
}

[xml]$senateXml = Get-RemoteText $senateUrl
[xml]$houseXml = Get-RemoteText $houseUrl
$districtGeoJson = (Get-RemoteText $districtUrl) | ConvertFrom-Json

$senators = @(
  $senateXml.contact_information.member |
    Where-Object { $_.state -in $mappedStates } |
    ForEach-Object {
      [ordered]@{
        id = [string]$_.bioguide_id
        name = (([string]$_.first_name).Trim() + ' ' + ([string]$_.last_name).Trim()).Trim()
        party = [string]$_.party
        state = [string]$_.state
        class = ([string]$_.class).Replace('Class ', '')
        website = [string]$_.website
      }
    }
)

$representatives = @(
  $houseXml.MemberData.members.member |
    Where-Object { ([string]$_.statedistrict).Substring(0, 2) -in $mappedStates } |
    ForEach-Object {
      $state = ([string]$_.statedistrict).Substring(0, 2)
      $district = [int](([string]$_.statedistrict).Substring(2, 2))
      $info = $_.'member-info'
      [ordered]@{
        id = [string]$info.bioguideID
        name = [string]$info.'official-name'
        party = [string]$info.party
        state = $state
        district = $district
        role = if ($state -eq 'DC') { 'Delegate' } else { 'Representative' }
      }
    }
)

$officials = [ordered]@{
  metadata = [ordered]@{
    congress = 119
    retrievedOn = $retrievedOn
    senatePublished = $retrievedOn
    housePublished = [string]$houseXml.MemberData.'publish-date'
    senateSource = $senateUrl
    houseSource = $houseUrl
  }
  senators = $senators
  representatives = $representatives
}

$districtGeoJson.features = @(
  $districtGeoJson.features |
    Where-Object {
      [string]$_.properties.STATE -in $mappedFips -and
      [string]$_.properties.CD119 -ne 'ZZ'
    } |
    ForEach-Object {
      [ordered]@{
        type = 'Feature'
        properties = [ordered]@{
          STATE = [string]$_.properties.STATE
          CD119 = [string]$_.properties.CD119
          GEOID = [string]$_.properties.GEOID
          NAME = [string]$_.properties.NAME
        }
        geometry = $_.geometry
      }
    }
)

$officialsPath = Join-Path $dataRoot 'federal-officials-119.json'
$districtsPath = Join-Path $dataRoot 'congressional-districts-119.geojson'

$officials | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 $officialsPath
$districtGeoJson | ConvertTo-Json -Depth 100 -Compress | Set-Content -Encoding utf8 $districtsPath

Write-Output "Wrote $($senators.Count) senators and $($representatives.Count) House members to $officialsPath"
Write-Output "Wrote $($districtGeoJson.features.Count) congressional districts to $districtsPath"
