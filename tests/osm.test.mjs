import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitQuery, filtersFor, bboxParam, overpassBody, placesFromOverpass } from '../src/lib/osmcore.js';

test('splitQuery separates what and location on the last " in "', () => {
  assert.deepEqual(splitQuery('auto repair shop in Detroit, MI'), { what: 'auto repair shop', location: 'Detroit, MI' });
  assert.deepEqual(splitQuery('independent auto shop in Troy in MI'), { what: 'independent auto shop in Troy', location: 'MI' });
  assert.deepEqual(splitQuery('plumbers'), { what: 'plumbers', location: '' });
});

test('filtersFor maps known kinds to OSM tags', () => {
  assert.ok(filtersFor('independent auto repair shop').includes('["shop"="car_repair"]'));
  assert.ok(filtersFor('mechanic').includes('["shop"="car_repair"]'));
  assert.ok(filtersFor('dental office').includes('["amenity"="dentist"]'));
  assert.ok(filtersFor('medical clinic').includes('["amenity"="clinic"]'));
  assert.ok(filtersFor('plant nursery').includes('["shop"="garden_centre"]'));
});

test('filtersFor falls back to a name match on the longest word for unknown kinds', () => {
  const f = filtersFor('artisanal cheesemonger');
  assert.ok(f.every((x) => x.includes('cheesemonger')), `expected name match, got ${JSON.stringify(f)}`);
  assert.ok(f.some((x) => x.includes('["shop"]')));
});

test('filtersFor never lets a kind inject into the Overpass query', () => {
  const f = filtersFor('weird"]kind');
  assert.ok(f.every((x) => !/kind"\]/.test(x.replace(/\["name"~"[^"]*/, ''))), 'quotes must be stripped from the name match');
});

test('bboxParam reorders Nominatim [S,N,W,E] into Overpass (S,W,N,E)', () => {
  // Nominatim returns [south, north, west, east]
  assert.equal(bboxParam(['42.25', '42.45', '-83.29', '-82.91']), '(42.25,-83.29,42.45,-82.91)');
  assert.equal(bboxParam(null), null);
  assert.equal(bboxParam(['a', 'b', 'c', 'd']), null);
});

test('overpassBody wraps every filter in the bbox and asks for tags and centers', () => {
  const body = overpassBody(['["shop"="car_repair"]', '["shop"="tyres"]'], '(1,2,3,4)', 60);
  assert.ok(body.startsWith('[out:json][timeout:25];('));
  assert.ok(body.includes('nwr["shop"="car_repair"](1,2,3,4);'));
  assert.ok(body.includes('nwr["shop"="tyres"](1,2,3,4);'));
  assert.ok(body.endsWith('out tags center 60;'));
});

test('placesFromOverpass reads name, contact and address, drops unnamed/disused, contactable first', () => {
  const elements = [
    { type: 'node', id: 1, tags: { name: 'No Contact Garage' } },
    { type: 'way', id: 2, tags: { name: "Al's Auto", phone: '+1 248-555-0100', website: 'https://als.example',
      'addr:housenumber': '12', 'addr:street': 'Main St', 'addr:city': 'Troy', 'addr:state': 'MI', 'addr:postcode': '48084' } },
    { type: 'node', id: 3, tags: {} }, // unnamed -> dropped
    { type: 'node', id: 4, tags: { name: 'Gone Motors', disused: 'yes' } }, // disused -> dropped
    { type: 'node', id: 5, tags: { name: 'Contact Tags Shop', 'contact:phone': '248-555-0200' } },
  ];
  const places = placesFromOverpass(elements, 10);
  assert.equal(places.length, 3, 'unnamed and disused dropped');
  // contactable first
  assert.ok(places[0].phone || places[0].website);
  const al = places.find((p) => p.name === "Al's Auto");
  assert.equal(al.placeId, 'osm:way/2');
  assert.equal(al.phone, '+1 248-555-0100');
  assert.equal(al.website, 'https://als.example');
  assert.equal(al.address, '12 Main St, Troy, MI, 48084');
  assert.equal(al.rating, null);
  assert.equal(al.operational, true);
  // the one with no contact is last
  assert.equal(places[places.length - 1].name, 'No Contact Garage');
});

test('placesFromOverpass dedupes repeated elements and caps at maxResults', () => {
  const dup = { type: 'node', id: 9, tags: { name: 'Twice', phone: '1' } };
  assert.equal(placesFromOverpass([dup, dup], 10).length, 1);
  const many = Array.from({ length: 5 }, (_, i) => ({ type: 'node', id: i, tags: { name: `B${i}`, phone: '1' } }));
  assert.equal(placesFromOverpass(many, 2).length, 2);
});
