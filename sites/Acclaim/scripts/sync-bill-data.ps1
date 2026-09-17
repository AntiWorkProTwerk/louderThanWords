[CmdletBinding()]
param(
  [int]$Congress = 119,
  [string]$BillType = 'hr',
  [int]$BillNumber = 3633
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$siteRoot = Split-Path -Parent $PSScriptRoot
$dataRoot = Join-Path $siteRoot 'public\data'
$envPath = Join-Path $siteRoot '.env'
$outputPath = Join-Path $dataRoot 'federal-bills-119.json'
$apiRoot = "https://api.congress.gov/v3/bill/$Congress/$($BillType.ToLowerInvariant())/$BillNumber"

function Get-LocalSecret([string]$Name) {
  $processValue = [Environment]::GetEnvironmentVariable($Name)
  if (-not [string]::IsNullOrWhiteSpace($processValue)) { return $processValue.Trim() }
  if (-not (Test-Path -LiteralPath $envPath)) { return $null }

  $line = Get-Content -LiteralPath $envPath |
    Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
    Select-Object -First 1
  if (-not $line) { return $null }
  return (($line -split '=', 2)[1].Trim().Trim('"').Trim("'"))
}

$apiKey = Get-LocalSecret 'CONGRESS_API_KEY'
if ([string]::IsNullOrWhiteSpace($apiKey)) {
  throw 'CONGRESS_API_KEY was not found in the process environment or the site .env file.'
}

$apiHeaders = @{ 'X-Api-Key' = $apiKey }

function Get-CongressJson([string]$Path) {
  $separator = if ($Path.Contains('?')) { '&' } else { '?' }
  return Invoke-RestMethod -Uri ($Path + $separator + 'format=json') -Headers $apiHeaders
}

function Get-OfficialXml([string]$Url) {
  $response = Invoke-WebRequest -Uri $Url -UseBasicParsing
  return [xml]$response.Content
}

function Get-NodeText($Node, [string]$XPath) {
  $selected = $Node.SelectSingleNode($XPath)
  if ($null -eq $selected) { return '' }
  return [string]$selected.InnerText
}

function ConvertTo-PlainText([string]$Html) {
  if ([string]::IsNullOrWhiteSpace($Html)) { return '' }
  $withBreaks = $Html -replace '(?i)</p>|</li>|<br\s*/?>', "`n"
  $withoutTags = $withBreaks -replace '<[^>]+>', ' '
  $decoded = [System.Net.WebUtility]::HtmlDecode($withoutTags)
  return (($decoded -split "`r?`n" | ForEach-Object { ($_ -replace '\s+', ' ').Trim() } | Where-Object { $_ }) -join "`n`n")
}

function ConvertTo-IdentityToken([string]$Value) {
  $decomposed = $Value.Normalize([Text.NormalizationForm]::FormD)
  $characters = foreach ($character in $decomposed.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($character) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      $character
    }
  }
  return ((-join $characters).ToUpperInvariant() -replace '[^A-Z0-9]', '')
}

function Get-HouseVote([string]$Url, $VoteReference) {
  $xml = Get-OfficialXml $Url
  $root = $xml.DocumentElement
  $metadata = $root.SelectSingleNode('vote-metadata')
  $records = @($root.SelectNodes('vote-data/recorded-vote'))
  $members = @(
    foreach ($record in $records) {
      $legislator = $record.SelectSingleNode('legislator')
      [ordered]@{
        id = [string]$legislator.GetAttribute('name-id')
        name = [string]$legislator.InnerText
        party = [string]$legislator.GetAttribute('party')
        state = [string]$legislator.GetAttribute('state')
        vote = Get-NodeText $record 'vote'
      }
    }
  )
  $grouped = $members | Group-Object { $_['vote'] }
  $counts = [ordered]@{}
  foreach ($group in $grouped) { $counts[$group.Name] = $group.Count }

  return [ordered]@{
    id = "house-$Congress-$($VoteReference.sessionNumber)-$($VoteReference.rollNumber)"
    chamber = 'House'
    congress = $Congress
    session = [int]$VoteReference.sessionNumber
    roll = [int]$VoteReference.rollNumber
    date = [string]$VoteReference.date
    question = Get-NodeText $metadata 'vote-question'
    description = Get-NodeText $metadata 'vote-desc'
    result = Get-NodeText $metadata 'vote-result'
    threshold = 'Simple majority'
    counts = $counts
    source = $Url
    members = $members
  }
}

function Get-SenateVote([string]$Url, $VoteReference, [hashtable]$SenateIdentityMap) {
  $xml = Get-OfficialXml $Url
  $root = $xml.DocumentElement
  $memberNodes = @($root.SelectNodes('members/member'))
  $members = @(
    foreach ($member in $memberNodes) {
      $lisId = Get-NodeText $member 'lis_member_id'
      $identityKey = (Get-NodeText $member 'state').ToUpperInvariant() + '|' + (ConvertTo-IdentityToken (Get-NodeText $member 'last_name'))
      if (-not $SenateIdentityMap.ContainsKey($identityKey)) {
        throw "No unique Senate roster identity matched vote member $identityKey"
      }
      [ordered]@{
        id = [string]$SenateIdentityMap[$identityKey]
        lisId = $lisId
        name = Get-NodeText $member 'member_full'
        party = Get-NodeText $member 'party'
        state = Get-NodeText $member 'state'
        vote = Get-NodeText $member 'vote_cast'
      }
    }
  )
  $grouped = $members | Group-Object { $_['vote'] }
  $counts = [ordered]@{}
  foreach ($group in $grouped) { $counts[$group.Name] = $group.Count }

  return [ordered]@{
    id = "senate-$Congress-$($VoteReference.sessionNumber)-$($VoteReference.rollNumber)"
    chamber = 'Senate'
    congress = $Congress
    session = [int]$VoteReference.sessionNumber
    roll = [int]$VoteReference.rollNumber
    date = [string]$VoteReference.date
    question = Get-NodeText $root 'vote_question_text'
    description = Get-NodeText $root 'vote_title'
    result = Get-NodeText $root 'vote_result_text'
    threshold = Get-NodeText $root 'majority_requirement'
    counts = $counts
    source = $Url
    members = $members
  }
}

$detail = (Get-CongressJson $apiRoot).bill
$actions = @((Get-CongressJson ($apiRoot + '/actions?limit=250')).actions)
$summaries = @((Get-CongressJson ($apiRoot + '/summaries?limit=250')).summaries)
$cosponsors = @((Get-CongressJson ($apiRoot + '/cosponsors?limit=250')).cosponsors)
$titles = @((Get-CongressJson ($apiRoot + '/titles?limit=250')).titles)

$senateRosterXml = Get-OfficialXml 'https://www.senate.gov/general/contact_information/senators_cfm.xml'
$senateIdentityMap = @{}
foreach ($member in @($senateRosterXml.contact_information.member)) {
  $identityKey = ([string]$member.state).ToUpperInvariant() + '|' + (ConvertTo-IdentityToken ([string]$member.last_name))
  $bioguideId = [string]$member.bioguide_id
  if ($senateIdentityMap.ContainsKey($identityKey)) {
    throw "Senate roster identity $identityKey is not unique. A manual LIS-to-Bioguide crosswalk is required."
  }
  if ($identityKey -and $bioguideId) { $senateIdentityMap[$identityKey] = $bioguideId }
}

$voteReferences = @(
  $actions |
    ForEach-Object { @($_.recordedVotes) } |
    Where-Object { $null -ne $_ -and $_.url } |
    Sort-Object chamber, sessionNumber, rollNumber -Unique
)
$votes = @(
  foreach ($vote in $voteReferences) {
    if ([string]$vote.chamber -eq 'House') {
      Get-HouseVote ([string]$vote.url) $vote
    } elseif ([string]$vote.chamber -eq 'Senate') {
      Get-SenateVote ([string]$vote.url) $vote $senateIdentityMap
    }
  }
)

$officialTitle = $titles |
  Where-Object { [int]$_.titleTypeCode -in @(7, 6) } |
  Sort-Object titleTypeCode -Descending |
  Select-Object -First 1
$latestSummary = $summaries | Sort-Object actionDate -Descending | Select-Object -First 1
$sponsor = @($detail.sponsors) | Select-Object -First 1

$normalized = [ordered]@{
  metadata = [ordered]@{
    congress = $Congress
    retrievedOn = (Get-Date).ToString('yyyy-MM-dd')
    source = 'https://api.congress.gov/v3'
    senateRosterSource = 'https://www.senate.gov/general/contact_information/senators_cfm.xml'
    notes = @(
      'Bill metadata and actions come from Congress.gov API v3.',
      'Member vote positions come from the official House Clerk and Senate roll-call XML records.',
      'No API credential is stored in this file.'
    )
  }
  bills = @(
    [ordered]@{
      id = "$Congress-$($BillType.ToLowerInvariant())-$BillNumber"
      congress = $Congress
      type = [string]$detail.type
      number = [string]$detail.number
      displayNumber = 'H.R. ' + [string]$detail.number
      title = [string]$detail.title
      officialTitle = if ($officialTitle) { [string]$officialTitle.title } else { [string]$detail.title }
      introducedDate = [string]$detail.introducedDate
      originChamber = [string]$detail.originChamber
      policyArea = [string]$detail.policyArea.name
      sponsor = [ordered]@{
        id = [string]$sponsor.bioguideId
        name = [string]$sponsor.fullName
        party = [string]$sponsor.party
        state = [string]$sponsor.state
        district = [int]$sponsor.district
      }
      cosponsorCount = $cosponsors.Count
      summary = ConvertTo-PlainText ([string]$latestSummary.text)
      summaryStage = [string]$latestSummary.actionDesc
      summaryDate = [string]$latestSummary.actionDate
      latestAction = [ordered]@{
        date = [string]$detail.latestAction.actionDate
        text = [string]$detail.latestAction.text
      }
      congressUrl = "https://www.congress.gov/bill/$($Congress)th-congress/house-bill/$BillNumber"
      actions = @(
        $actions | ForEach-Object {
          [ordered]@{
            date = [string]$_.actionDate
            time = [string]$_.actionTime
            text = [string]$_.text
            type = [string]$_.type
          }
        }
      )
      votes = $votes
    }
  )
}

$normalized | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $outputPath -Encoding utf8
Write-Output "Wrote $($normalized.bills.Count) bill with $($votes.Count) recorded votes to $outputPath"
Write-Output "Normalized $((@($votes | ForEach-Object { $_.members }).Count)) member vote records without storing the API key."
