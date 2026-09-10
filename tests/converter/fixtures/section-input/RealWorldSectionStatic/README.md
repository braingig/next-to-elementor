# RealWorldSectionStatic — isolation fixture

Purpose: same multi-file folder shape as RealWorldSection, but:

- no `Array.map()`
- three explicit `<FeatureCard … />` instances
- static literal props at call sites
- `CTAButton` uses a literal `href="/start"`

Used to separate folder-import success from existing converter limits
(prop substitution, dynamic expressions).

Browser pick folder: `manual-validation/RealWorldSectionStatic/`
