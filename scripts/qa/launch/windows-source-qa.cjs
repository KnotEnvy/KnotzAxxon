const fs=require('node:fs');
const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
Object.assign(process.env,config.env);
require(config.script);
