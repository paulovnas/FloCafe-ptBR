/**
 * GET /api/pos-info
 * Returns LAN access URLs (mDNS + local IP) and QR codes for either the full
 * POS or the mobile waiter order pad. `?mode=waiter` selects `/waiter`;
 * omitting it preserves the existing full-POS response.
 */
import { Router, Request, Response } from 'express';
import QRCode from 'qrcode';
import { getLocalIP, getAllLocalIPs, getServerPort } from '../server';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const port = getServerPort();
  const ip = getLocalIP();
  const allIps = getAllLocalIPs();
  const pathname = req.query.mode === 'waiter' ? '/waiter' : '';

  const mdnsUrl = `http://flo.local:${port}${pathname}`;
  const ipUrl   = `http://${ip}:${port}${pathname}`;
  const qrUrl   = ipUrl;

  const ipsData = await Promise.all(allIps.map(async (localIp) => {
    const url = `http://${localIp}:${port}${pathname}`;
    try {
      const qr_data = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', width: 256 });
      return { ip: localIp, url, qr_data };
    } catch {
      return { ip: localIp, url, qr_data: null };
    }
  }));

  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'M', width: 256 });
  } catch (err) {
    console.warn('[POS-Info] QR generation failed:', err);
  }

  res.json({
    mdns_url:    mdnsUrl,
    ip_url:      ipUrl,
    qr_url:      qrUrl,
    qr_data_url: qrDataUrl,
    ips_data:    ipsData,
  });
});

export const posInfoRoutes = router;
