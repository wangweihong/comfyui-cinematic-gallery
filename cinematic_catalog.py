"""Resolve movie references without changing legacy motion identifiers or routes."""
from . import motion_catalog, style_catalog

def source(identifier):
    return style_catalog if isinstance(identifier, str) and identifier.startswith("style_") else motion_catalog

def reference(identifier): return source(identifier).reference(identifier)
def asset(identifier, kind): return source(identifier).asset(identifier, kind)
def validate_assets(identifier): return source(identifier).validate_assets(identifier)
def poster_array(identifier): return source(identifier).poster_array(identifier)
def fingerprint(identifier): return source(identifier).fingerprint(identifier)
def description(row, language): return source(row["id"]).description(row, language)

def browser_catalog():
    motions, styles = motion_catalog.browser_catalog(), style_catalog.browser_catalog()
    return {"version": 1,
            "categories": [{**c, "kind": kind} for kind, data in (("motion", motions), ("style", styles)) for c in data["categories"]],
            "records": [{**r, "kind": kind} for kind, data in (("motion", motions), ("style", styles)) for r in data["records"]]}
