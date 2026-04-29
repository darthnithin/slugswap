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
 import { Platform, Text } from 'react-native';

 export default function ExploreScreen() {
   if (Platform.OS === 'ios') {
     return <AppleMaps.View style={{ flex: 1 }} />;
   } else if (Platform.OS === 'android') {
     return <GoogleMaps.View style={{ flex: 1 }} />;
   } else {
     return <Text>Maps are only available on Android and iOS</Text>;
   }
 }
