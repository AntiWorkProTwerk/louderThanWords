[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$siteRoot = Split-Path -Parent $PSScriptRoot
$dataRoot = Join-Path $siteRoot 'public\data'
$outputPath = Join-Path $dataRoot 'presidential-election-results.json'
$repositoryUrl = 'https://github.com/tonmcg/US_County_Level_Election_Results_08-24'
$rawRoot = 'https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master'
$mitMirrorUrl = 'https://raw.githubusercontent.com/dlb8685/us_county_election_results/main/data/raw_data/mit_election_labs__countypres_2000-2024.csv'
$years = @(2016, 2020, 2024)

$countyTopology = Get-Content -Raw (Join-Path $dataRoot 'us-counties-10m.json') | ConvertFrom-Json
$mapCountyIds = @{}
foreach ($geometry in $countyTopology.objects.counties.geometries) {
  $mapCountyIds[([string]$geometry.id).PadLeft(5, '0')] = $true
}

$stateFipsByCode = [ordered]@{
  AL='01'; AK='02'; AZ='04'; AR='05'; CA='06'; CO='08'; CT='09'; DE='10'; DC='11'
  FL='12'; GA='13'; HI='15'; ID='16'; IL='17'; IN='18'; IA='19'; KS='20'; KY='21'
  LA='22'; ME='23'; MD='24'; MA='25'; MI='26'; MN='27'; MS='28'; MO='29'; MT='30'
  NE='31'; NV='32'; NH='33'; NJ='34'; NM='35'; NY='36'; NC='37'; ND='38'; OH='39'
  OK='40'; OR='41'; PA='42'; RI='44'; SC='45'; SD='46'; TN='47'; TX='48'; UT='49'
  VT='50'; VA='51'; WA='53'; WV='54'; WI='55'; WY='56'
}

$stateCodeByName = @{
  'Alabama'='AL'; 'Alaska'='AK'; 'Arizona'='AZ'; 'Arkansas'='AR'; 'California'='CA'
  'Colorado'='CO'; 'Connecticut'='CT'; 'Delaware'='DE'; 'District of Columbia'='DC'
  'Florida'='FL'; 'Georgia'='GA'; 'Hawaii'='HI'; 'Idaho'='ID'; 'Illinois'='IL'
  'Indiana'='IN'; 'Iowa'='IA'; 'Kansas'='KS'; 'Kentucky'='KY'; 'Louisiana'='LA'
  'Maine'='ME'; 'Maryland'='MD'; 'Massachusetts'='MA'; 'Michigan'='MI'; 'Minnesota'='MN'
  'Mississippi'='MS'; 'Missouri'='MO'; 'Montana'='MT'; 'Nebraska'='NE'; 'Nevada'='NV'
  'New Hampshire'='NH'; 'New Jersey'='NJ'; 'New Mexico'='NM'; 'New York'='NY'
  'North Carolina'='NC'; 'North Dakota'='ND'; 'Ohio'='OH'; 'Oklahoma'='OK'; 'Oregon'='OR'
  'Pennsylvania'='PA'; 'Rhode Island'='RI'; 'South Carolina'='SC'; 'South Dakota'='SD'
  'Tennessee'='TN'; 'Texas'='TX'; 'Utah'='UT'; 'Vermont'='VT'; 'Virginia'='VA'
  'Washington'='WA'; 'West Virginia'='WV'; 'Wisconsin'='WI'; 'Wyoming'='WY'
}

function Convert-ToVoteCount($Value) {
  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return [long]0 }
  return [long][double]$Value
}

function New-Result($Rows) {
  $democratic = [long]0
  $republican = [long]0
  $total = [long]0

  foreach ($row in @($Rows)) {
    $democratic += Convert-ToVoteCount $row.votes_dem
    $republican += Convert-ToVoteCount $row.votes_gop
    $total += Convert-ToVoteCount $row.total_votes
  }

  if ($democratic + $republican -gt $total) {
    throw "Major-party votes exceed total votes: D=$democratic R=$republican T=$total"
  }

  return [ordered]@{ d=$democratic; r=$republican; t=$total }
}

$yearData = [ordered]@{}

foreach ($year in $years) {
  $fileName = "${year}_US_County_Level_Presidential_Results.csv"
  $sourceUrl = if ($year -eq 2016) { $mitMirrorUrl } else { "$rawRoot/$fileName" }
  $temporaryPath = Join-Path ([System.IO.Path]::GetTempPath()) "actions-$fileName"

  try {
    & curl.exe -L --fail --silent --show-error -o $temporaryPath $sourceUrl
    if ($LASTEXITCODE -ne 0) { throw "Unable to retrieve $sourceUrl" }
    $rows = if ($year -eq 2016) {
      @(
        Import-Csv -LiteralPath $temporaryPath |
          Where-Object { $_.year -eq '2016' -and $_.mode -eq 'TOTAL' -and $_.county_fips }
      )
    } else {
      @(Import-Csv -LiteralPath $temporaryPath)
    }

    $states = [ordered]@{}
    $counties = [ordered]@{}

    if ($year -eq 2016) {
      $normalizedRows = @(
        foreach ($countyGroup in $rows | Group-Object { "$($_.state_po)|$($_.county_fips)" }) {
          $countyRows = @($countyGroup.Group)
          [pscustomobject]@{
            state_code = [string]$countyRows[0].state_po
            county_fips = ([int][double]$countyRows[0].county_fips).ToString('D5')
            votes_dem = [long](($countyRows | Where-Object party -eq 'DEMOCRAT' | Measure-Object candidatevotes -Sum).Sum)
            votes_gop = [long](($countyRows | Where-Object party -eq 'REPUBLICAN' | Measure-Object candidatevotes -Sum).Sum)
            total_votes = [long][double]$countyRows[0].totalvotes
          }
        }
      )

      foreach ($stateGroup in $normalizedRows | Group-Object state_code) {
        $stateCode = [string]$stateGroup.Name
        if (-not $stateFipsByCode.Contains($stateCode)) { continue }
        $states[$stateFipsByCode[$stateCode]] = New-Result @($stateGroup.Group)
      }

      foreach ($row in $normalizedRows) {
        $stateCode = [string]$row.state_code
        if ($stateCode -eq 'AK' -or -not $stateFipsByCode.Contains($stateCode)) { continue }
        $countyFips = [string]$row.county_fips
        if (-not $mapCountyIds.ContainsKey($countyFips)) { continue }
        $counties[$countyFips] = New-Result @($row)
      }
    } else {
      foreach ($stateGroup in $rows | Group-Object state_name) {
        $stateName = [string]$stateGroup.Name
        $stateCode = [string]$stateCodeByName[$stateName]
        if ([string]::IsNullOrWhiteSpace($stateCode)) { continue }
        $states[$stateFipsByCode[$stateCode]] = New-Result @($stateGroup.Group)
      }

      foreach ($row in $rows) {
        $stateName = [string]$row.state_name
        $stateCode = [string]$stateCodeByName[$stateName]
        if ([string]::IsNullOrWhiteSpace($stateCode) -or $stateCode -in @('AK', 'DC')) { continue }
        $rawFips = ([string]$row.county_fips).Split('.')[0]
        if ([string]::IsNullOrWhiteSpace($rawFips)) { continue }
        $countyFips = ([int]$rawFips).ToString('D5')
        if (-not $mapCountyIds.ContainsKey($countyFips)) { continue }
        $counties[$countyFips] = New-Result @($row)
      }

      $dcRows = @($rows | Where-Object state_name -eq 'District of Columbia')
      if ($dcRows.Count -gt 0) {
        $counties['11001'] = New-Result $dcRows
      }
    }

    if ($states.Count -ne 51) {
      throw "Expected 51 state-level results for $year; found $($states.Count)"
    }

    $yearData[[string]$year] = [ordered]@{
      source = $sourceUrl
      states = $states
      counties = $counties
    }

    Write-Output "${year}: $($states.Count) state results, $($counties.Count) county results"
  } finally {
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath
    }
  }
}

$payload = [ordered]@{
  metadata = [ordered]@{
    normalizedOn = (Get-Date).ToString('yyyy-MM-dd')
    office = 'U.S. President'
    years = $years
    sourceRepository = $repositoryUrl
    mitResearchSource = 'https://doi.org/10.7910/DVN/VOQCHQ'
    mitMirror = 'https://github.com/dlb8685/us_county_election_results'
    officialStateReference = 'https://www.fec.gov/introduction-campaign-finance/election-results-and-voting-information/'
    notes = @(
      '2016 uses a documented mirror of the MIT Election Data and Science Lab county-return file.'
      '2020 and 2024 use a public compilation and are not an authoritative federal results feed.'
      'Alaska state totals are included, but county-equivalent results are omitted because Alaska reports by legislative district.'
      'District of Columbia ward rows are aggregated to county-equivalent FIPS 11001.'
    )
  }
  elections = $yearData
}

$payload | ConvertTo-Json -Depth 10 -Compress | Set-Content -Encoding utf8 $outputPath
Write-Output "Wrote $outputPath"
