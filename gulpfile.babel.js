import gulp from "gulp"
import babel from "gulp-babel"
import watch from "gulp-watch"
import plumber from "gulp-plumber"
import nomnom from "nomnom"

const es5dir = "dist/es5"
const options = nomnom
  .option("watch", {flag: true})
  .parse()

gulp.task("default", [
  "babelify-lib",
  "babelify-bin",
  "babelify-index"
])

gulp.task("babelify-lib", () =>
  watchableSrc("lib/*.js")
    .pipe(plumber())
    .pipe(babel())
    .pipe(gulp.dest(`${es5dir}/lib`)))

gulp.task("babelify-bin", () =>
  watchableSrc("bin/*.js")
    .pipe(plumber())
    .pipe(babel())
    .pipe(gulp.dest(`${es5dir}/bin`)))

gulp.task("babelify-index", () =>
  watchableSrc("index.js")
    .pipe(plumber())
    .pipe(babel())
    .pipe(gulp.dest(es5dir)))

function watchableSrc (glob) {
  const src = gulp.src(glob)

  if (options.watch) {
    return src.pipe(watch(glob))
  }
  else {
    return src
  }
}
