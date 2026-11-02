import { useEffect, useRef, useState } from 'react';
import { useChartStore } from '../store/chartStore';

export interface Liquidation {
  id: string;
  symbol: string;
  exchange: 'Binance';
  side: 'long' | 'short';
  price: number;
  quantity: number;
  value: number;
  time: number;
}

export function useLiquidations() {
  const { trackedSymbols, liquidationSettings } = useChartStore();
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const lastSoundTimeRef = useRef<number>(0);

  useEffect(() => {
    if (trackedSymbols.length === 0) {
      setIsConnected(false);
      return;
    }

    const connect = () => {
      const ws = new WebSocket('wss://fstream.binance.com/ws/!forceOrder@arr');
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ Binance Liquidations WebSocket connected');
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const liquidationsArray = Array.isArray(data) ? data : [data];
          
          liquidationsArray.forEach((item: any) => {
            if (!item.o) return;
            
            const order = item.o;
            const symbol = order.s;
            
            if (!trackedSymbols.includes(symbol)) return;
            
            const threshold = liquidationSettings.thresholds[symbol] || 800000;
            const price = parseFloat(order.p);
            const quantity = parseFloat(order.q);
            const value = price * quantity;
            
            if (value < threshold) return;
            
            const side = order.S === 'SELL' ? 'long' : 'short';
            
            const liquidation: Liquidation = {
              id: `binance-${order.T}-${symbol}`,
              symbol,
              exchange: 'Binance',
              side,
              price,
              quantity,
              value,
              time: order.T,
            };
            
            setLiquidations(prev => {
              const newLiqs = [liquidation, ...prev];
              return newLiqs.slice(0, liquidationSettings.maxItems);
            });
            
            if (liquidationSettings.soundEnabled) {
              const now = Date.now();
              if (now - lastSoundTimeRef.current > 1000) {
                playSound(side);
                lastSoundTimeRef.current = now;
              }
            }
          });
        } catch (err) {
          console.error('Error parsing liquidation data:', err);
        }
      };

      ws.onclose = () => {
        console.log('❌ Binance Liquidations WebSocket disconnected');
        setIsConnected(false);
        setTimeout(connect, 5000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.close();
      };
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [trackedSymbols, liquidationSettings]);

  const playSound = (side: 'long' | 'short') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.frequency.value = side === 'long' ? 800 : 600;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (err) {
      console.error('Error playing sound:', err);
    }
  };

  return {
    liquidations,
    isConnected,
  };
}