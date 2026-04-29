# MBHI API Notes

This is a reverse-engineered reference for the UCSC MBHI shortcode AJAX surface used by:

- `https://dining.wordpress.ucsc.edu/wp-admin/admin-ajax.php`
- `action=mb-bhipro-fetch-shortcode`

It combines:

- documented shortcode behavior from the Studio Wombat shortcodes overview
- live observations against the UCSC endpoint on April 23, 2026

Docs source:

- [Studio Wombat shortcodes overview](https://www.studiowombat.com/kb-article/shortcodes-overview/?utm_source=chatgpt.com)

## Request shape

The endpoint behaves like a shortcode renderer over AJAX.

Query parameters:

- `t`: client-side timestamp, typically Unix epoch milliseconds
- `action`: `mb-bhipro-fetch-shortcode`
- `code`: shortcode name such as `mbhi` or `mbhi_hours`
- `options`: base64-encoded shortcode attributes string

Example:

```text
https://dining.wordpress.ucsc.edu/wp-admin/admin-ajax.php?t=1776978924330&action=mb-bhipro-fetch-shortcode&code=mbhi&options=<base64>
```

Decoded `options` example:

```text
location="College Nine⁄JRL Dining Hall" format="12" approximation="true"
```

## Supported shortcode codes

Observed or documented shortcode codes:

- `mbhi`
- `mbhi_hours`
- `mbhi_vacations`
- `mbhi_specials`
- `mbhi_seo`
- `mbhi_ifopen`
- `mbhi_ifclosed`

## Documented shortcode attributes

### `mbhi`

Required:

- `location`

Documented optional attributes:

- `format`
- `openmessage`
- `closedmessage`
- `approximation`
- `openingsoonmessage`
- `openingsoonmessagetime`
- `closingsoonmessage`
- `closingsoonmessagetime`
- `show_specialdate_messages`
- `specialdate_message_open`
- `specialdate_message_closed`
- `from`
- `to`

Observed at UCSC but not in public docs:

- `includetime`
- `includeday`
- `removezeroes`
- `extra_classes`
- `show_vacation_messages`
- `vacation_message_closed`
- `loading`

### `mbhi_hours`

Required:

- `location`

Documented optional attributes:

- `format`
- `display`
- `output`
- `includevacations`
- `includeholidays`
- `consolidationseparator`
- `hourseparator`
- `entryseparator`
- `mhbr`
- `abbreviatedays`
- `showonlytoday`
- `dates_in_past`
- `replace_with_specials`
- `included_specials_format`

### `mbhi_vacations`

Uses the same attributes as `mbhi_hours`.

### `mbhi_specials`

Uses the same attributes as `mbhi_hours`.

### `mbhi_seo`

Documented attribute:

- `location`

### `mbhi_ifopen`

Documented attribute:

- `location`

Expected to wrap inner content in WordPress shortcode syntax.

### `mbhi_ifclosed`

Documented attribute:

- `location`

Expected to wrap inner content in WordPress shortcode syntax.

## Observed responses at UCSC

All probes below used:

- endpoint: `https://dining.wordpress.ucsc.edu/wp-admin/admin-ajax.php`
- action: `mb-bhipro-fetch-shortcode`
- attrs: `location="College Nine⁄JRL Dining Hall"`

### `mbhi`

- status: `200`
- content type: `text/html; charset=UTF-8`
- response shape: status indicator span

Example:

```html
<span class="mb-bhi-display mb-bhi-open"><span class="mb-bhi-oc-text">OPEN - Closes at 11 PM</span></span>
```

### `mbhi_hours`

- status: `200`
- content type: `text/html; charset=UTF-8`
- response shape: HTML table of hours

### `mbhi_vacations`

- status: `200`
- content type: `text/html; charset=UTF-8`
- response shape: vacations table plus schema.org markup
- This returns a https://schema.org/openingHours 
- Example:
`https://dining.wordpress.ucsc.edu/wp-admin/admin-ajax.php?t=1776980724295&action=mb-bhipro-fetch-shortcode&code=mbhi_vacations&options=`
```
<table class="mabel-bhi-businesshours"><tbody></tbody></table>
<div itemtype="http://schema.org/Restaurant" itemscope>
	<meta itemprop="name" content="College Nine⁄JRL Dining Hall">
    	<meta itemprop="openingHours" content="Mo 7:00-20:00"><meta itemprop="openingHours" content="Tu-Sa 7:00-23:00"><meta itemprop="openingHours" content="Su 7:00-20:00">            <div itemprop="openingHoursSpecification" itemscope itemtype="http://schema.org/OpeningHoursSpecification">
                                    <time itemprop="validFrom validThrough" datetime="2026-05-22"></time>
                                    <time itemprop="opens" datetime="07:00:00"></time>
                                    <time itemprop="closes" datetime="20:00:00"></time>
                            </div>
                        <div itemprop="openingHoursSpecification" itemscope itemtype="http://schema.org/OpeningHoursSpecification">
                                    <time itemprop="validFrom validThrough" datetime="2026-05-23"></time>
                                    <time itemprop="opens" datetime="07:00:00"></time>
                                    <time itemprop="closes" datetime="20:00:00"></time>
                            </div>
                        <div itemprop="openingHoursSpecification" itemscope itemtype="http://schema.org/OpeningHoursSpecification">
                                    <time itemprop="validFrom validThrough" datetime="2026-05-24"></time>
                                    <time itemprop="opens" datetime="07:00:00"></time>
                                    <time itemprop="closes" datetime="20:00:00"></time>
                            </div>
                        <div itemprop="openingHoursSpecification" itemscope itemtype="http://schema.org/OpeningHoursSpecification">
                                    <time itemprop="validFrom validThrough" datetime="2026-05-25"></time>
                                    <time itemprop="opens" datetime="07:00:00"></time>
                                    <time itemprop="closes" datetime="20:00:00"></time>
                            </div>
            </div>
```

### `mbhi_specials`

- status: `200`
- content type: `text/html; charset=UTF-8`
- response shape: special dates table

### `mbhi_seo`

- status: `200`
- content type: `text/html; charset=UTF-8`
- response shape: schema.org metadata block

### `mbhi_ifopen`

- status: `200`
- content type: `text/html; charset=UTF-8`
- response shape: empty body when no wrapped content is supplied

### `mbhi_ifclosed`

- status: `200`
- content type: `text/html; charset=UTF-8`
- response shape: empty body when no wrapped content is supplied

## Machine-readable schema

A JSON view of the current schema is available from the local dashboard app:

- `/api/mbhi/schema`

That route returns:

- docs metadata
- request shape
- shortcode definitions
- observed probes

## Recommended next steps

If you want deeper enumeration beyond what is documented here:

1. Add a probe runner that tests every optional attribute individually.
2. Capture whether unknown attributes are ignored or change output.
3. Snapshot HTML output per shortcode and per attribute combination.
4. Record defaults inferred by omitting attributes one at a time.
