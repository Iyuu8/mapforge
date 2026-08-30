import { useContext } from 'react';
import { MapContext } from '../context/MapContext';

export default function useMap() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMap must be used inside MapProvider');
  }
  return context;
}
