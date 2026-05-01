import { AppleMaps } from 'expo-maps';
import {
  AppleMapsMapStyleElevation,
  AppleMapsMapStyleEmphasis,
} from 'expo-maps/build/apple/AppleMaps.types';
import { useRouter } from 'expo-router';
import { Platform, Text } from 'react-native';

const UCSC_DINING_HALL_MARKERS: AppleMaps.Marker[] = [
  {
    id: '05',
    title: 'Cowell/Stevenson Dining Hall',
    monogram: 'C/S',
    tintColor: '#006AAD',
    coordinates: {
      latitude: 36.996813,
      longitude: -122.053062,
    },
  },
  {
    id: '20',
    title: 'Crown/Merrill Dining Hall',
    monogram: 'C/M',
    tintColor: '#006AAD',
    coordinates: {
      latitude: 37.000187,
      longitude: -122.054438,
    },
  },
  {
    id: '40',
    title: 'College Nine/John R. Lewis Dining Hall',
    monogram: 'C9',
    tintColor: '#006AAD',
    coordinates: {
      latitude: 37.000812,
      longitude: -122.057812,
    },
  },
  {
    id: '25',
    title: 'Porter/Kresge Dining Hall',
    monogram: 'PK',
    tintColor: '#006AAD',
    coordinates: {
      latitude: 36.994187,
      longitude: -122.065938,
    },
  },
  {
    id: '30',
    title: 'Rachel Carson/Oakes Dining Hall',
    monogram: 'RCC',
    tintColor: '#006AAD',
    coordinates: {
      latitude: 36.991563,
      longitude: -122.065438,
    },
  },
];

export default function ExploreScreen() {
  const router = useRouter();

  if (Platform.OS === 'ios') {
    return <AppleMaps.View
      style={{ flex: 1 }}
      cameraPosition={
        {
          coordinates: {
            latitude: 36.996,
            longitude: -122.0605,
          },
          zoom: 14,
        }
      }
      markers={UCSC_DINING_HALL_MARKERS}
      onMarkerClick={(marker) => {
        if (!marker.id) return;

        router.push({
          pathname: '/(tabs)/menu',
          params: { locationId: marker.id },
        });
      }}
      properties={
        {
          elevation: AppleMapsMapStyleElevation.REALISTIC,
          emphasis: AppleMapsMapStyleEmphasis.AUTOMATIC,
        }
      }
    />;
  } else if (Platform.OS === 'android') {
    return <Text>Maps are only available on iOS</Text>;
  } else {
    return <Text>Maps are only available on iOS</Text>;
  }
}
