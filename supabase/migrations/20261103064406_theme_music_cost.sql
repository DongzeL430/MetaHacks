-- Each new theme now also has Muse Spark compose a short music box piece (the generate-theme Edge
-- Function), about 1 cent more. The shared daily budget counts a theme as 4 cents instead of 3.
-- The weekly limit stays 3 themes per student.

update private.muse_limits set cost_cents = 4 where kind = 'theme';
