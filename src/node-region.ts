// Cached node region - fetched once on startup
let cachedNodeRegion = 'unknown';

export function setNodeRegion(region: string) {
  cachedNodeRegion = region;
}

export function getNodeRegion(): string {
  return cachedNodeRegion;
}

export async function fetchAndSetNodeRegion(): Promise<string> {
  try {
    const locResponse = await fetch(`http://ip-api.com/json/`);
    const locData = await locResponse.json();
    
    const awsRegionMap: { [key: string]: string } = {
      'US': 'us-east-1',
      'CA': 'ca-central-1',
      'BR': 'sa-east-1',
      'IE': 'eu-west-1',
      'GB': 'eu-west-2',
      'FR': 'eu-west-3',
      'DE': 'eu-central-1',
      'IT': 'eu-south-1',
      'ES': 'eu-south-2',
      'SE': 'eu-north-1',
      'CH': 'eu-central-2',
      'AE': 'me-south-1',
      'IL': 'il-central-1',
      'IN': 'ap-south-1',
      'SG': 'ap-southeast-1',
      'ID': 'ap-southeast-3',
      'MY': 'ap-southeast-5',
      'TH': 'ap-southeast-2',
      'JP': 'ap-northeast-1',
      'KR': 'ap-northeast-2',
      'CN': 'cn-north-1',
      'HK': 'ap-east-1',
      'AU': 'ap-southeast-2',
      'NZ': 'ap-southeast-4',
      'ZA': 'af-south-1',
    };
    
    if (locData.countryCode) {
      cachedNodeRegion = awsRegionMap[locData.countryCode] || `${locData.countryCode.toLowerCase()}-region-1`;
    }
    console.log(`Node region: ${cachedNodeRegion}`);
    return cachedNodeRegion;
  } catch (error) {
    console.error('Error getting node location on startup:', error);
    return 'unknown';
  }
}
