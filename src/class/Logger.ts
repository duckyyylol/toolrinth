import { ShardClientUtil } from "discord.js";
import chalk from "chalk"
import { formatTime } from "../util";

export default class Logger {
  protected shard: ShardClientUtil | null;

  constructor(shard: ShardClientUtil | null = null) {
    this.shard = shard;
  }

  prefix(): string {
    return `[${formatTime(Date.now())}]`
  }

  info(...args: any[]) {
    for (const arg of args) {
      try {
        console.log(chalk.white(this.prefix(), chalk.blue(JSON.stringify(arg))))
      }catch(e) {
        console.log(chalk.white(this.prefix(), chalk.blue(arg)))
      }
    }
  }

  warn(...args: any[]) {
    for(const arg of args) {
      try {
        console.log(chalk.yellowBright(this.prefix(), chalk.yellow(JSON.stringify(arg))))
      }catch(e) {
        console.log(chalk.yellowBright(this.prefix(), chalk.yellow(arg)))
      }
    }
  }

  success(...args: any[]) {
    for(const arg of args) {
      try {
        console.log(chalk.white(this.prefix(), chalk.green(JSON.stringify(arg))))
      }catch(e) {
        console.log(chalk.white(this.prefix(), chalk.green(arg)))
      }
    }
  }

  error(...args: any[]) {
    for(const arg of args) {
      try {
        console.log(chalk.redBright(this.prefix(), chalk.red(JSON.stringify(arg))))
      } catch (e) {
        console.log(chalk.redBright(this.prefix(), chalk.red(arg)))
      }
    }
  }
}
