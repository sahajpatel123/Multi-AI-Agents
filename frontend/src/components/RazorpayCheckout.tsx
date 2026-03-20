import { useEffect, useRef } from 'react';
import { createSubscription, verifyPayment } from '../api';

interface Props {
  planKey: string;
  prefillEmail?: string;
  onSuccess: () => void;
  onError: (error: string) => void;
  onClose: () => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const loadRazorpayScript = (): Promise<boolean> =>
  new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export function RazorpayCheckout({ planKey, prefillEmail, onSuccess, onError, onClose }: Props) {
  const effectGeneration = useRef(0);

  useEffect(() => {
    const gen = ++effectGeneration.current;

    const run = async () => {
      const loaded = await loadRazorpayScript();
      if (gen !== effectGeneration.current) return;
      if (!loaded) {
        onError('Payment system failed to load. Check your internet connection.');
        return;
      }

      try {
        const subscriptionData = await createSubscription(planKey);

        if (gen !== effectGeneration.current) return;
        if (!window.Razorpay) {
          onError('Payment system failed to load. Check your internet connection.');
          return;
        }

        const options: Record<string, unknown> = {
          key: subscriptionData.key_id,
          subscription_id: subscriptionData.subscription_id,
          name: 'Arena',
          description: subscriptionData.plan_name,
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_subscription_id: string;
            razorpay_signature: string;
          }) => {
            try {
              const result = await verifyPayment(
                response.razorpay_payment_id,
                response.razorpay_subscription_id,
                response.razorpay_signature,
              );
              if (result.status === 'success') {
                onSuccess();
              } else {
                onError('Payment verification failed');
              }
            } catch {
              onError('Payment verification failed');
            }
          },
          prefill: {
            email: prefillEmail || '',
          },
          theme: {
            color: '#C4956A',
          },
          modal: {
            ondismiss: onClose,
          },
        };

        if (gen !== effectGeneration.current) return;
        const rzp = new window.Razorpay(options);
        rzp.open();
      } catch (e: unknown) {
        if (gen !== effectGeneration.current) return;
        const msg = e instanceof Error ? e.message : 'Failed to start payment';
        onError(msg);
      }
    };

    void run();
  }, [planKey, prefillEmail, onSuccess, onError, onClose]);

  return null;
}
