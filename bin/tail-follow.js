import TailFollow from "../lib/TailFollow.js"

const file = process.argv[2]
const tail = new TailFollow(file)
tail.pipe(process.stdout)
