import {spawnSync} from 'node:child_process'
import {verifyStagingBuild} from '../verify-staging-build.js'
const command=process.env.npm_execpath?process.execPath:(process.platform==='win32'?'npm.cmd':'npm')
const args=[...(process.env.npm_execpath?[process.env.npm_execpath]:[]),'run','build','--','--mode','staging','--config','vite.cinema.config.js']
const result=spawnSync(command,args,{stdio:'inherit',shell:command.endsWith('.cmd'),env:{...process.env,CLOUDFLARE_ENV:'staging',VITE_CINEMA_PUBLIC_PREVIEW:'1'}})
if(result.error)throw result.error
if(result.status!==0)process.exit(result.status||1)
await verifyStagingBuild()
