import React from 'react';
import { cn } from '../../lib/utils';
import bullLogo from '../../assets/kairon-bull.png';

export const BullLogo = ({ className, alt = 'Karion Bull Logo' }) => {
  return (
    <img
      src={bullLogo}
      alt={alt}
      className={cn('object-contain', className)}
      loading="eager"
      decoding="async"
    />
  );
};

export default BullLogo;
