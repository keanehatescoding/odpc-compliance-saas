// Registers what Kinga sells with KRA eTIMS (safe to run again), or finds an
// item classification for ETIMS_ITEM_CLASS:
//   npm run etims:items
//   npm run etims:items -- --classes software
import { etimsFromEnv } from "@/lib/etims";
import { registerEtimsItems } from "@/lib/etims-invoices";

const etims = etimsFromEnv();
if (!etims) {
  console.error("eTIMS isn't set up: set ETIMS_URL, ETIMS_TIN, ETIMS_CMC_KEY and ETIMS_SDC_ID (see npm run etims:init).");
  process.exit(1);
}

const args = process.argv.slice(2);
try {
  if (args[0] === "--classes") {
    const classes = await etims.itemClasses(args.slice(1).join(" "));
    if (classes.length === 0) console.log("No classification matches.");
    for (const c of classes) console.log(`${c.code}  ${c.name}`);
  } else {
    for (const item of await registerEtimsItems(etims)) {
      console.log(`${item.itemCd}  ${item.itemNm}  ${item.added ? "registered" : "already registered"}`);
    }
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
