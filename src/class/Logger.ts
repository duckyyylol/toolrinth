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
    console.info(chalk.white(this.prefix(), chalk.blue(args)))
  }

  warn(...args: any[]) {
    console.info(chalk.yellowBright(this.prefix(), chalk.yellow(args)))
  }

  success(...args: any[]) {
    console.info(chalk.white(this.prefix(), chalk.green(args)))
  }

  error(...args: any[]) {
    console.info(chalk.redBright(this.prefix(), chalk.red(args)))
  }
}
