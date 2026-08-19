import { DetailRouteFrame } from '@/components/DetailRouteFrame';
import WalletScreen from '@/components/personal/WalletScreen';

export default function MyGetRoute() {
  return (
    <DetailRouteFrame title="My GET">
      <WalletScreen />
    </DetailRouteFrame>
  );
}
