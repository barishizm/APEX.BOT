// Static markup; the reveal is CSS-only so the demo renders without JS.
export function HeroDemo() {
  return (
    <figure className="demo">
      <div className="demo__head">
        <span className="demo__dot" aria-hidden="true" />
        <span>Apex Bot · coffeeroasters.com</span>
      </div>

      <div className="demo__body">
        <p className="msg msg--visitor">Can I return the coffee if I don't like it?</p>
        <div className="msg msg--bot">
          <p>
            Yes. If the bag is unopened, you can return it free of charge within 14 days of delivery. Ground coffee
            can't be returned.
          </p>
          <span className="msg__source">coffeeroasters.com/returns</span>
        </div>
      </div>

      <figcaption className="sr-only">
        Example conversation: Apex Bot answers the visitor's return question based on the site's returns page and shows the source.
      </figcaption>
    </figure>
  );
}
