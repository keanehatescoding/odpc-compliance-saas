// Sets up this server as a KRA eTIMS OSCU device, once, and prints the
// details to put in env:
//   ETIMS_URL=... ETIMS_TIN=... ETIMS_BHF_ID=00 ETIMS_DEVICE_SERIAL=... npm run etims:init
import { EtimsError, initializeDevice, SANDBOX_URL } from "@/lib/etims";

const { ETIMS_URL, ETIMS_TIN, ETIMS_BHF_ID, ETIMS_DEVICE_SERIAL } = process.env;
if (!ETIMS_URL || !ETIMS_TIN || !ETIMS_DEVICE_SERIAL) {
  console.error(`Set ETIMS_URL (e.g. ${SANDBOX_URL}), ETIMS_TIN (your KRA PIN) and ETIMS_DEVICE_SERIAL (from KRA).`);
  process.exit(1);
}

try {
  const device = await initializeDevice({
    url: ETIMS_URL,
    tin: ETIMS_TIN,
    bhfId: ETIMS_BHF_ID || "00",
    deviceSerial: ETIMS_DEVICE_SERIAL,
  });
  console.log(`Device set up for ${device.taxpayerName ?? ETIMS_TIN}${device.branchName ? `, ${device.branchName}` : ""}.`);
  console.log("Add these to the environment (keep the key secret):\n");
  console.log(`ETIMS_CMC_KEY=${device.cmcKey}`);
  console.log(`ETIMS_SDC_ID=${device.sdcId}`);
  if (device.mrcNo) console.log(`# MRC number, for your records: ${device.mrcNo}`);
} catch (err) {
  console.error(err instanceof EtimsError ? err.message : err);
  if (err instanceof EtimsError && err.code === "902") console.error("KRA says this device is already set up; ask KRA to reset it to get the key again.");
  process.exit(1);
}
