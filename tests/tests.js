
QUnit.test( "a basic test example", function( assert ) {
	var value = "hello";
	assert.equal( value, "hello", "We expect value to be hello" );
});

QUnit.module( "wp.updates" );
QUnit.test( "Update lock", function( assert ) {
	assert.equal( wp.updates.updateLock, false, "Update lock should be false." );
});
