import { requireOptionalNativeModule } from 'expo';

export type CampusMapsNativeModule = {
  openDirectionsAsync(
    name: string,
    latitude: number,
    longitude: number,
  ): Promise<boolean>;
};

/** Null on older app binaries, Android, and web. */
export default requireOptionalNativeModule<CampusMapsNativeModule>('CampusMaps');
