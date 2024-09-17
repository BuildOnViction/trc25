// Import the necessary dependencies
import hhe from 'hardhat';
import { Signer, BigNumber } from 'ethers';
import { expect } from 'chai';
import { SampleVRC25Upgradable } from '../typechain-types';
import { ECDSASignature, EIP712Domain, EIP712TypeDefinition } from './EIP712';
import { time } from '@nomicfoundation/hardhat-network-helpers';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

describe('SampleVRC25 token', async function() {
  let owner: Signer;
  let ownerAddress: string;
  let sender: Signer;
  let senderAddress: string;
  let recipient: Signer;
  let recipientAddress: string;
  let c98Token: SampleVRC25Upgradable;
  let minFee = hhe.ethers.utils.parseEther('1');
  let snapshot: any;

  before(async function() {
    [owner, sender, recipient] = await hhe.ethers.getSigners();
    ownerAddress = await owner.getAddress();
    senderAddress = await sender.getAddress();
    recipientAddress = await recipient.getAddress();
    const tokenFactory = await hhe.ethers.getContractFactory('SampleVRC25Upgradable');
    c98Token = await tokenFactory.connect(owner).deploy();
    await c98Token.deployed();
  });

  beforeEach(async function() {
    snapshot = await hhe.ethers.provider.send('evm_snapshot', []);
  });

  afterEach(async function() {
    await hhe.ethers.provider.send('evm_revert', [snapshot]);
  });

  it('cannot set fee without ownership', async function() {
    await expect(c98Token.connect(recipient).setFee(minFee))
      .to.be.revertedWith('VRC25: caller is not the owner');
  });

  it('check ownership', async function() {
    expect(await c98Token.owner()).to.equal(ownerAddress);
  });

  it('should transfer ownership', async function() {
    await c98Token.transferOwnership(recipientAddress);
    expect(await c98Token.owner()).to.equal(ownerAddress);
    await c98Token.connect(recipient).acceptOwnership();
    expect(await c98Token.owner()).to.equal(recipientAddress);
  });

  it('cannot transfer ownership without ownership', async function() {
    await expect(c98Token.connect(recipient).transferOwnership(recipientAddress))
      .to.be.revertedWith('VRC25: caller is not the owner');
  });

  it('should mint tokens', async function() {
    const amount = hhe.ethers.utils.parseEther('1000');
    const balanceBefore = await c98Token.balanceOf(recipientAddress);
    await c98Token.connect(owner).mint(recipientAddress, amount);
    const balanceAfter = await c98Token.balanceOf(recipientAddress);
    expect(balanceAfter).to.equal(balanceBefore.add(amount));
  });

  it('cannot mint without ownership', async function() {
    await expect(c98Token.connect(recipient).mint(ownerAddress, hhe.ethers.utils.parseEther('1')))
      .to.be.revertedWith('VRC25: caller is not the owner');
  });

  it('should burn tokens without fee', async function() {
    await c98Token.connect(owner).mint(senderAddress, hhe.ethers.utils.parseEther('1000'));
    const amount = hhe.ethers.utils.parseEther('100');
    await c98Token.setFee(0);
    const balanceBefore = await c98Token.balanceOf(senderAddress);
    await c98Token.connect(sender).burn(amount);
    const balanceAfter = await c98Token.balanceOf(senderAddress);
    expect(balanceAfter).to.equal(balanceBefore.sub(amount));
  });

  it('cannot burn exceeds balance', async function() {
    await c98Token.connect(owner).mint(senderAddress, hhe.ethers.utils.parseEther('1000'));
    const amount = hhe.ethers.utils.parseEther('1001');
    await expect(c98Token.connect(owner).burn(amount))
      .to.be.revertedWith('VRC25: insuffient balance');
  });

  it('should transfer tokens', async function() {
    await c98Token.connect(owner).mint(senderAddress, hhe.ethers.utils.parseEther('1000'));
    const initialSenderBalance = hhe.ethers.utils.parseEther('1000');
    const transferAmount = hhe.ethers.utils.parseEther('500');
    const fee = await c98Token.estimateFee(transferAmount);
    const initialRecipientBalance = hhe.ethers.BigNumber.from(0);
    const ownerBalance = await c98Token.balanceOf(senderAddress);
    const recipientBalance = await c98Token.balanceOf(recipientAddress);
    expect(ownerBalance).to.equal(initialSenderBalance);
    expect(recipientBalance).to.equal(initialRecipientBalance);
    await c98Token.connect(sender).transfer(recipientAddress, transferAmount);
    expect(await c98Token.balanceOf(senderAddress)).to.equal(initialSenderBalance.sub(transferAmount.add(fee)));
    expect(await c98Token.balanceOf(recipientAddress)).to.equal(initialRecipientBalance.add(transferAmount));
  });

  it('cannot transfer exceeds balance', async function() {
    await c98Token.connect(owner).mint(senderAddress, hhe.ethers.utils.parseEther('1000'));
    const amount = hhe.ethers.utils.parseEther('1001');
    await expect(c98Token.connect(sender).transfer(recipientAddress, amount))
      .to.be.revertedWith('VRC25: insuffient balance');
  });

  it('cannot transfer to the zero address', async function() {
    await c98Token.connect(owner).mint(senderAddress, hhe.ethers.utils.parseEther('1000'));
    const transferAmount = hhe.ethers.utils.parseEther('500');
    await expect(c98Token.connect(sender).transfer(ZERO_ADDRESS, transferAmount))
      .to.be.revertedWith('VRC25: transfer to the zero address');
  });

  it('should approve tokens', async function() {
    await c98Token.connect(owner).mint(senderAddress, hhe.ethers.utils.parseEther('1000'));
    const beforeAllowance = await c98Token.allowance(senderAddress, recipientAddress);
    const amount = hhe.ethers.utils.parseEther('1000');
    await c98Token.connect(owner).setFee(minFee);
    await expect(await c98Token.connect(sender).approve(recipientAddress, amount))
      .changeTokenBalance(c98Token, owner, minFee);
    const afterAllowance = await c98Token.allowance(senderAddress, recipientAddress);
    expect(afterAllowance).to.equal(beforeAllowance.add(amount));
  });

  it('cannot approve to the zero address', async function() {
    await c98Token.connect(owner).mint(senderAddress, hhe.ethers.utils.parseEther('1000'));
    await expect(c98Token.connect(owner).approve(ZERO_ADDRESS, '1'))
      .to.be.revertedWith('VRC25: approve to the zero address');
  });

  it('should transferFrom successful', async function() {
    await c98Token.connect(owner).mint(senderAddress, hhe.ethers.utils.parseEther('1000'));
    const balanceBefore = await c98Token.balanceOf(recipientAddress);
    const amount = hhe.ethers.utils.parseEther('100');
    await c98Token.connect(sender).approve(recipientAddress, hhe.ethers.utils.parseEther('200'));
    expect(await c98Token.allowance(senderAddress, recipientAddress)).to.equal(hhe.ethers.utils.parseEther('200'));
    await c98Token.connect(recipient).transferFrom(senderAddress, recipientAddress, amount);
    const fee = await c98Token.estimateFee(amount);
    expect(await c98Token.allowance(senderAddress, recipientAddress)).to.equal(hhe.ethers.utils.parseEther('200').sub(amount).sub(fee));
    const balanceAfter = await c98Token.balanceOf(recipientAddress);
    expect(balanceAfter).to.equal(balanceBefore.add(amount));
  });
});
