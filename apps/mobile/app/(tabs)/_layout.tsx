import {
  NativeTabs,
  Icon,
  Label,
} from "expo-router/unstable-native-tabs";
import { TabCacheProvider } from "../../../../lib/tab-cache-context";

export default function TabLayout() {
  return (
    <TabCacheProvider>
      <NativeTabs minimizeBehavior="onScrollDown">
        <NativeTabs.Trigger name="(share)">
          <Icon sf={{ default: "heart", selected: "heart.fill" }} />
          <Label>Share</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(request)">
          <Icon sf={{ default: "hand.raised", selected: "hand.raised.fill" }} />
          <Label>Request</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </TabCacheProvider>
  );
}
