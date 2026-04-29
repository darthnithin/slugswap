/* import { TabPlaceholderScreen } from '../../components/TabPlaceholderScreen';

export default function ExploreScreen() {
  return (
    <TabPlaceholderScreen
      title="Explore"
      icon="map-outline"
      description="Coming Soon!"
    />
  );
}
 */
 import { AppleMaps, GoogleMaps } from 'expo-maps';
import { AppleMapsMapStyleElevation, AppleMapsMapStyleEmphasis } from 'expo-maps/build/apple/AppleMaps.types';
 import { Platform, Text } from 'react-native';

export default function ExploreScreen() {
  if (Platform.OS === 'ios') {
    return <AppleMaps.View style={{ flex: 1 }}
      cameraPosition={
        {
          coordinates: {
            latitude: 36.994,
            longitude: -122.06,
          },
          zoom: 10,
        }
      }
      properties={
        { elevation: AppleMapsMapStyleElevation.REALISTIC, emphasis: AppleMapsMapStyleEmphasis.AUTOMATIC}
      }
     />;
   } else if (Platform.OS === 'android') {
     // return <GoogleMaps.View style={{ flex: 1 }} />;
     return <Text>Maps are only available on iOS</Text>;
   } else {
     return <Text>Maps are only available on Android and iOS</Text>;
   }
 }
